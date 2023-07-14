import { ITfTask, TfBuildTaskPlugin } from "~plugin/impl/tf-apply-task-plugin";
import { IPluginBinding, PluginBinder } from "~plugin/plugin-binder";
import { TemplateRoot } from "~parser/parser";
import { PersistedState } from "~state/persisted-state";
import { TestTemplates } from "../../test-templates";
import { ChildProcessUtility } from "~util/child-process-util";

describe('when creating terraform plugin', () => {
    let plugin: TfBuildTaskPlugin;

    beforeEach(() => {
        plugin = new TfBuildTaskPlugin();
    });

    test('plugin has the right type',() => {
        expect(plugin.type).toBe('tf');
    });


    test('plugin can translate config to command args',() => {
        const commandArgs = plugin.convertToCommandArgs( {
            FilePath: './tasks.yaml',
            Type: 'tf',
            MaxConcurrentTasks: 6,
            FailedTaskTolerance: 4,
            LogicalName: 'test-task',
            Path: './',
            Plan: true,
            TaskRoleName: 'TaskRole',
            OrganizationBinding: { IncludeMasterAccount: true}  },
            { organizationFile: './organization.yml'} as any);
        expect(commandArgs.name).toBe('test-task');
        expect(commandArgs.path).toBe('./');
        expect(commandArgs.organizationFile).toBe('./organization.yml');
        expect(commandArgs.maxConcurrent).toBe(6);
        expect(commandArgs.failedTolerance).toBe(4);
        expect(commandArgs.taskRoleName).toBe('TaskRole');
        expect(commandArgs.organizationBinding).toBeDefined();
        expect(commandArgs.organizationBinding.IncludeMasterAccount).toBe(true);
        expect(commandArgs.customDeployCommand).toBeUndefined();
        expect(commandArgs.plan).toBeTruthy();
    });
});


describe('when resolving attribute expressions on update', () => {
    let spawnProcessForAccountSpy: jest.SpyInstance;
    let binding: IPluginBinding<ITfTask>;
    let task: ITfTask;
    let plugin: TfBuildTaskPlugin;
    let template: TemplateRoot;
    let state: PersistedState;
    let binder: PluginBinder<ITfTask>;

    beforeEach(() => {
        template = TestTemplates.createBasicTemplate();
        state = TestTemplates.createState(template);
        plugin = new TfBuildTaskPlugin();
        spawnProcessForAccountSpy = jest.spyOn(ChildProcessUtility, 'SpawnProcessForAccount').mockImplementation();

        task = {
            name: 'taskName',
            type: 'tf',
            path: './',
            hash: '123123123',
            logVerbose: true,
            forceDeploy: true,
        };

        binding = {
            action: 'UpdateOrCreate',
            target: {
                targetType: 'terraform',
                organizationLogicalName: 'default',
                logicalAccountId: 'Account',
                accountId: '1232342341235',
                region: 'eu-central-1',
                lastCommittedHash: '123123123',
                logicalName: 'taskName',
                definition: task,
            },
            task,
            previousBindingLocalHash: 'abcdef'
        };
        binder = new PluginBinder<ITfTask>(task, 'default', undefined, state, template, undefined, plugin);
    });

    test('spawn process is called when nothing needs to be substituted', async () => {
        await binder.createPerformForUpdateOrCreate(binding)();
        expect(spawnProcessForAccountSpy).toHaveBeenCalledTimes(2);
    });

    test('custom deploy command can use CurrentTask.Parameters to get parameters', async () => {
        task.plan = true

        await binder.createPerformForUpdateOrCreate(binding)();

        expect(spawnProcessForAccountSpy).toHaveBeenCalledTimes(2);
        expect(spawnProcessForAccountSpy).lastCalledWith(expect.anything(), expect.stringContaining('plan'), expect.anything(), undefined, "eu-central-1", expect.anything(), true);
    });


    test('custom deploy command can use multiple substitutions', async () => {
        task.plan = false

        await binder.createPerformForUpdateOrCreate(binding)();

        expect(spawnProcessForAccountSpy).toHaveBeenCalledTimes(2);
        expect(spawnProcessForAccountSpy).lastCalledWith(expect.anything(), expect.stringContaining('apply'), expect.anything(), undefined, "eu-central-1", expect.anything(), true);
    });

        afterEach(() => {
        jest.restoreAllMocks();
    });
});
