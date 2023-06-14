import { readFileSync } from 'fs';
import { Command } from 'commander';
import { BaseCliCommand, ICommandArgs } from './base-command';
import { UpdateOrganizationCommand } from './update-organization';
import { BuildTaskProvider } from '~build-tasks/build-task-provider';
import { ITrackedTask, PersistedState } from '~state/persisted-state';
import { Validator } from '~parser/validator';
import { BuildConfiguration } from '~build-tasks/build-configuration';
import { BuildRunner } from '~build-tasks/build-runner';
import { ConsoleUtil } from '~util/console-util';
import { S3StorageProvider } from '~state/storage-provider';
import { AwsEvents } from '~aws-provider/aws-events';
import { yamlParse } from '~yaml-cfn/index';
import { GlobalState } from '~util/global-state';
import { FileUtil } from '~util/file-util';
import { AwsUtil } from '~util/aws-util';

const commandName = 'perform-tasks <tasks-file>';
const commandDescription = 'performs all tasks from either a file or directory structure';

const DEFAULT_ORGANIZATION_OBJECT = 'organization.yml';


export class PerformTasksCommand extends BaseCliCommand<IPerformTasksCommandArgs> {
    static async Perform(command: IPerformTasksCommandArgs): Promise<void> {
        const x = new PerformTasksCommand();
        await x.performCommand(command);
    }

    constructor(command?: Command) {
        super(command, commandName, commandDescription, 'tasksFile');
    }

    public addOptions(command: Command): void {
        command.option('--debug-templating [debug-templating]', 'when set to true the output of text templating processes will be stored on disk', false);
        command.option('--dev', 'use development settings, e.g. DefaultDevelopmentBuildAccessRoleName instead of DefaultBuildAccessRoleName', false);
        command.option('--failed-stacks-tolerance <failed-stacks-tolerance>', 'the number of failed stacks (within a task) after which execution stops', 0);
        command.option('--failed-tasks-tolerance <failed-tasks-tolerance>', 'the number of failed tasks after which execution stops', 0);
        command.option('--large-template-bucket-name [large-template-bucket-name]', 'bucket used when uploading large templates. default is to create a bucket just-in-time in the target account');
        command.option('--logical-name <tasks-logical-name>', 'logical name of the tasks file, allows multiple tasks files to be used together with --perform-cleanup action', 'default');
        command.option('--match [match]', 'glob pattern used to define/filter which tasks to run.');
        command.option('--max-concurrent-stacks <max-concurrent-stacks>', 'maximum number of stacks (within a task) to be executed concurrently', 1);
        command.option('--max-concurrent-tasks <max-concurrent-tasks>', 'maximum number of tasks to be executed concurrently', 1);
        command.option('--organization-file [organization-file]', 'organization file used for organization bindings');
        command.option('--organization-state-bucket-name [organization-state-bucket-name]', 'name of the bucket that contains the read-only organization state');
        command.option('--organization-state-object [organization-state-object]', 'key for object used to load read-only organization state');
        command.option('--parameters [parameters]', 'parameters used when creating build tasks from tasks file');
        command.option('--perform-cleanup', 'when set will remove resources created by previous perform-tasks after task is removed from tasks file', false);
        command.option('--templating-context-file [templating-context-file]', 'json file used as context for nunjuck text templating of organization and tasks file');

        command.option('--skip-storing-state', 'when set, the state will not be stored');
        super.addOptions(command);
    }

    public async performCommand(command: IPerformTasksCommandArgs): Promise<void> {
        const tasksFile = command.tasksFile;

        if (command.dev) {
            AwsUtil.SetIsDevelopmentBuild(true);
        }

        Validator.validatePositiveInteger(command.maxConcurrentStacks, 'maxConcurrentStacks');
        Validator.validatePositiveInteger(command.failedStacksTolerance, 'failedStacksTolerance');
        Validator.validatePositiveInteger(command.maxConcurrentTasks, 'maxConcurrentTasks');
        Validator.validatePositiveInteger(command.failedTasksTolerance, 'failedTasksTolerance');
        this.loadTemplatingContext(command);
        this.storeCommand(command);

        AwsUtil.SetLargeTemplateBucketName(command.largeTemplateBucketName);
        command.parsedParameters = this.parseCfnParameters(command.parameters);
        const config = new BuildConfiguration(tasksFile, command.parsedParameters, command.TemplatingContext);

        const template = await config.fixateOrganizationFile(command);
        const state = await this.getState(command);

        GlobalState.Init(state, template);

        const tasks = config.enumBuildTasks(command);
        ConsoleUtil.state = state;

        if (command.match) {
            const skippedTasks = this.skipNonMatchingLeafTasks(tasks, command.match, '');
            if (skippedTasks === tasks.length) {
                ConsoleUtil.LogWarning(`--match parameter glob '${command.match}' did not match any tasks. Use --verbose to see the tasks it did not match`);
            }
        }

        state.performUpdateToVersion2IfNeeded();
        UpdateOrganizationCommand.ResetHasRan();

        await BuildRunner.RunTasks(tasks, command.verbose === true, command.maxConcurrentTasks, command.failedTasksTolerance);
        const tracked = state.getTrackedTasks(command.logicalName);
        const cleanupTasks = BuildTaskProvider.enumTasksForCleanup(tracked, tasks, command);
        if (cleanupTasks.length > 0) {
            await BuildRunner.RunTasks(cleanupTasks, command.verbose === true, command.maxConcurrentTasks, command.failedTasksTolerance);
        }
        const tasksToTrack = BuildTaskProvider.recursivelyFilter(tasks, x => x.physicalIdForCleanup !== undefined);
        const trackedTasks: ITrackedTask[] = tasksToTrack.map(x => { return { physicalIdForCleanup: x.physicalIdForCleanup, logicalName: x.name, type: x.type, concurrencyForCleanup: x.concurrencyForCleanup }; });
        state.setTrackedTasks(command.logicalName, trackedTasks);

        if (UpdateOrganizationCommand.HasRan === true) {
            await PerformTasksCommand.PublishChangedOrganizationFileIfChanged(command, state);
        }

        await state.save();
    }

    public static async PublishChangedOrganizationFileIfChanged(command: IPerformTasksCommandArgs, state: PersistedState): Promise<void> {
        if (FileUtil.IsRemoteFile(command.organizationFile)) { return; }
        if (command.organizationFileHash !== state.getTemplateHashLastPublished()) {
            const contents = command.organizationFileContents ?? readFileSync(command.organizationFile).toString();
            const object = yamlParse(contents);
            const objectKey = command.organizationObject || DEFAULT_ORGANIZATION_OBJECT;
            const stateBucketName = await BaseCliCommand.GetStateBucketName(command.stateBucketName);
            const storageProvider = await S3StorageProvider.Create(stateBucketName, objectKey);

            await storageProvider.putObject(object);
            state.putTemplateHashLastPublished(command.organizationFileHash);
            await AwsEvents.putOrganizationChangedEvent(stateBucketName, objectKey);
        }

    }
}

export interface IPerformTasksCommandArgs extends ICommandArgs {
    failedStacksTolerance: number;
    failedTasksTolerance: number;
    forceDeploy?: boolean;
    largeTemplateBucketName?: string;
    logicalName: string;
    logicalNamePrefix?: string;
    match?: string;
    maxConcurrentStacks: number;
    maxConcurrentTasks: number;
    organizationFile?: string;
    organizationFileContents?: string;
    organizationFileHash?: string;
    organizationObject?: any;
    parameters?: string | {};
    parsedParameters?: Record<string, string>;
    performCleanup: boolean;
    skipStoringState?: true;
    tasksFile: string;
    TemplatingContext?: {};
    templatingContextFile?: string;
}
