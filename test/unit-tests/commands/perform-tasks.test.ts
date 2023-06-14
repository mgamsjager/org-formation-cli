import { Command, Option } from 'commander';
import { PerformTasksCommand, IPerformTasksCommandArgs } from '~commands/perform-tasks';
import { BuildConfiguration, IBuildTask, IBuildTaskConfiguration } from '~build-tasks/build-configuration';
import { PersistedState, ITrackedTask } from '~state/persisted-state';
import { BuildRunner } from '~build-tasks/build-runner';
import { BuildTaskProvider } from '~build-tasks/build-task-provider';
import { ConsoleUtil } from '~util/console-util';
import { DeleteStacksCommand, BaseCliCommand } from '~commands/index';
import { IUpdateOrganizationTaskConfiguration } from '~build-tasks/tasks/update-organization-task';

describe('when creating perform-tasks command', () => {
    let command: PerformTasksCommand;
    let commanderCommand: Command;
    let subCommanderCommand: Command;

    beforeEach(() => {
        commanderCommand = new Command('root');
        command = new PerformTasksCommand(commanderCommand);
        subCommanderCommand = commanderCommand.commands[0];
    });

    test('perform-tasks command is created', () => {
        expect(command).toBeDefined();
        expect(subCommanderCommand).toBeDefined();
        expect(subCommanderCommand.name()).toBe('perform-tasks');
    });

    test('perform-tasks command has description', () => {
        expect(subCommanderCommand).toBeDefined();
        expect(subCommanderCommand.description()).toBeDefined();
    });

    test('perform-tasks command has file as first argument', () => {
        const firstArg = subCommanderCommand._args[0];
        expect(firstArg).toBeDefined();
        expect(firstArg.required).toBe(true);
        expect(firstArg.name).toBe('tasks-file');
    });

    test('perform-tasks has state bucket parameter with correct default', () => {
        const opts: Option[] = subCommanderCommand.options;
        const stateBucketOpt = opts.find((x) => x.long === '--state-bucket-name');
        expect(stateBucketOpt).toBeDefined();
        expect(subCommanderCommand.stateBucketName).toBe('organization-formation-${AWS::AccountId}');
    });

    test('perform-tasks has state file parameter with correct default', () => {
        const opts: Option[] = subCommanderCommand.options;
        const stateObjectOpt = opts.find((x) => x.long === '--state-object');
        expect(stateObjectOpt).toBeDefined();
        expect(subCommanderCommand.stateObject).toBe('state.json');
    });

    test('perform-tasks has logical name parameter with correct default', () => {
        const opts: Option[] = subCommanderCommand.options;
        const logicalNameOpt = opts.find((x) => x.long === '--logical-name');
        expect(logicalNameOpt).toBeDefined();
        expect(subCommanderCommand.logicalName).toBe('default');
    });

    test('perform-tasks has perform cleanup parameter with correct default', () => {
        const opts: Option[] = subCommanderCommand.options;
        const performCleanupOpt = opts.find((x) => x.long === '--perform-cleanup');
        expect(performCleanupOpt).toBeDefined();
        expect(subCommanderCommand.performCleanup).toBeFalsy();
    });

    test('perform-tasks has parameters attribute', () => {
        const opts: Option[] = subCommanderCommand.options;
        const parametersOpt = opts.find((x) => x.long === '--parameters');
        expect(parametersOpt).toBeDefined();
        expect(parametersOpt.required).toBe(false);
    });

    test('perform-tasks has master-account-id which is optional', () => {
        const opts: Option[] = subCommanderCommand.options;
        const masterAccountIdOpt = opts.find((x) => x.long === '--master-account-id');
        expect(masterAccountIdOpt).toBeDefined();
        expect(masterAccountIdOpt.required).toBeFalsy();
    });
    test('perform-tasks has organization-state-object which is optional', () => {
        const opts: Option[] = subCommanderCommand.options;
        const organizationStateObjectOpt = opts.find((x) => x.long === '--organization-state-object');
        expect(organizationStateObjectOpt).toBeDefined();
        expect(organizationStateObjectOpt.required).toBeFalsy();
    });
});



describe('when executing perform-tasks command', () => {
    let command: PerformTasksCommand;
    let commanderCommand: Command;
    let subCommanderCommand: Command;
    let buildConfigurationEnumConfigMock: jest.SpyInstance;
    let buildConfigurationEnumTasksMock: jest.SpyInstance;
    let buildConfigurationFixateConfigMock: jest.SpyInstance;
    let performTasksGetStateMock: jest.SpyInstance;
    let buildRunnerRunTasksMock: jest.SpyInstance;
    let commandArgs: IPerformTasksCommandArgs;
    let configs: IBuildTaskConfiguration[];
    let tasks: IBuildTask[];
    let state: PersistedState;

    beforeEach(() => {

        configs = [{
            Type: 'update-organization',
            LogicalName: 'updateOrg',
            Template: 'organization.yml',
        } as IUpdateOrganizationTaskConfiguration]


        tasks = [{
            name: 'updateOrg',
            type: 'update-organization',
            childTasks: [],
            skip: undefined,
            perform: async () => { },
            isDependency: () => false,
        }]

        state = PersistedState.CreateEmpty('123123123123');

        buildConfigurationEnumConfigMock = jest.spyOn(BuildConfiguration.prototype, 'enumBuildConfiguration').mockReturnValue(configs);
        buildConfigurationEnumTasksMock = jest.spyOn(BuildConfiguration.prototype, 'enumBuildTasks').mockReturnValue(tasks);
        buildConfigurationFixateConfigMock = jest.spyOn(BuildConfiguration.prototype, 'fixateOrganizationFile').mockReturnValue(Promise.resolve(undefined));
        performTasksGetStateMock = jest.spyOn(PerformTasksCommand.prototype, 'getState').mockReturnValue(Promise.resolve(state));
        buildRunnerRunTasksMock = jest.spyOn(BuildRunner, 'RunTasks').mockImplementation();

        commanderCommand = new Command('root');
        command = new PerformTasksCommand(commanderCommand);
        subCommanderCommand = commanderCommand.commands[0];

        commandArgs = { maxConcurrentStacks: 1, failedStacksTolerance: 0, maxConcurrentTasks: 1, failedTasksTolerance: 0, tasksFile: 'tasks.yml', logicalName: 'default' } as IPerformTasksCommandArgs;
    });


    afterEach(() => {
        jest.restoreAllMocks();
    })

    test('BuildConfiguration called to enum config', async () => {
        await command.performCommand(commandArgs);
        expect(buildConfigurationEnumConfigMock).toHaveBeenCalledTimes(1);
        expect(buildConfigurationEnumConfigMock).toHaveBeenCalledWith('tasks.yml', undefined);
    });

    test('BuildConfiguration called to fixate configuration file', async () => {
        await command.performCommand(commandArgs);
        expect(buildConfigurationFixateConfigMock).toHaveBeenCalledTimes(1);
    });

    test('BuildConfiguration called to enum tasks', async () => {
        await command.performCommand(commandArgs);
        expect(buildConfigurationEnumTasksMock).toHaveBeenCalledTimes(1);
        expect(buildConfigurationEnumTasksMock).toHaveBeenCalledWith(commandArgs);
    });

    test('getState called to get state', async () => {
        await command.performCommand(commandArgs);
        expect(performTasksGetStateMock).toHaveBeenCalledTimes(1);
        expect(performTasksGetStateMock).toHaveBeenCalledWith(commandArgs);
    });

    test('perform tasks is called once', async () => {
        await command.performCommand(commandArgs);
        expect(buildRunnerRunTasksMock).toHaveBeenCalledTimes(1);
        expect(buildRunnerRunTasksMock).toHaveBeenCalledWith(tasks, false, 1, 0);
    });

    describe('with update stacks tasks', () => {

        let stateSaveMock: jest.SpyInstance;

        beforeEach(() => {
            const updateStacks: IBuildTask[] = [
                { name: 'updateStacks1', type: 'update-stacks', childTasks: [], physicalIdForCleanup: 'stack-name-1', skip: undefined, perform: async () => { }, isDependency: () => false },
                { name: 'updateStacks2', type: 'update-stacks', childTasks: [], physicalIdForCleanup: 'stack-name-2', skip: undefined, perform: async () => { }, isDependency: () => false }
            ];

            stateSaveMock = jest.spyOn(PersistedState.prototype, 'save').mockImplementation();

            tasks = tasks.concat(updateStacks);
            buildConfigurationEnumTasksMock = jest.spyOn(BuildConfiguration.prototype, 'enumBuildTasks').mockReturnValue(tasks);
        });

        test('BuildConfiguration called to enum tasks', async () => {
            await command.performCommand(commandArgs);
            expect(buildConfigurationEnumTasksMock).toHaveBeenCalledTimes(1);
            expect(buildConfigurationEnumTasksMock).toHaveBeenCalledWith(commandArgs);
        });

        test('perform tasks is called once', async () => {
            await command.performCommand(commandArgs);
            expect(buildRunnerRunTasksMock).toHaveBeenCalledTimes(1);
            expect(buildRunnerRunTasksMock).toHaveBeenCalledWith(tasks, false, 1, 0);
        });

        test('stacks are stored as tracked tasks', async () => {
            await command.performCommand(commandArgs);
            const trackedTasks = state.getTrackedTasks(commandArgs.logicalName);
            expect(trackedTasks).toBeDefined();
            expect(trackedTasks.length).toBe(2);
            expect(trackedTasks[0].physicalIdForCleanup).toBe('stack-name-1');
            expect(trackedTasks[1].physicalIdForCleanup).toBe('stack-name-2');
        });

        test('state is saved', async () => {
            await command.performCommand(commandArgs);
            expect(stateSaveMock).toHaveBeenCalledTimes(1);
        });

        describe('and stack to clean up', () => {
            let deleteStacksCommandPerformMock: jest.SpyInstance;
            let logWarningMock: jest.SpyInstance;
            let logInfoMock: jest.SpyInstance;
            let buildTaskProviderCreateDeleteTaskMock: jest.SpyInstance;

            beforeEach(() => {

                const trackedTasks: ITrackedTask[] = [
                    { logicalName: 'updateStacks1', type: 'update-stacks', physicalIdForCleanup: 'stack-name-1' },
                    { logicalName: 'updateStacks2', type: 'update-stacks', physicalIdForCleanup: 'stack-name-2' },
                    { logicalName: 'updateStacks3', type: 'update-stacks', physicalIdForCleanup: 'stack-name-3' },
                ]

                state.setTrackedTasks('default', trackedTasks);
                state.putValue('state-version', '2');
                buildTaskProviderCreateDeleteTaskMock = jest.spyOn(BuildTaskProvider, 'createDeleteTask');
                deleteStacksCommandPerformMock = jest.spyOn(DeleteStacksCommand, 'Perform').mockImplementation();
                jest.spyOn(BaseCliCommand, 'CreateAdditionalArgsForInvocation').mockReturnValue(Promise.resolve(''));
                logWarningMock = jest.spyOn(ConsoleUtil, 'LogWarning').mockImplementation();
                logInfoMock = jest.spyOn(ConsoleUtil, 'LogInfo').mockImplementation();
            });

            test('perform tasks is called twice', async () => {
                await command.performCommand(commandArgs);
                expect(buildRunnerRunTasksMock).toHaveBeenCalledTimes(2);
                expect(buildRunnerRunTasksMock).toHaveBeenCalledWith(tasks, false, 1, 0);
            });

            test('stacks are stored as tracked tasks', async () => {
                await command.performCommand(commandArgs);
                const trackedTasks = state.getTrackedTasks(commandArgs.logicalName);
                expect(trackedTasks).toBeDefined();
                expect(trackedTasks.length).toBe(2);
                expect(trackedTasks[0].physicalIdForCleanup).toBe('stack-name-1');
                expect(trackedTasks[1].physicalIdForCleanup).toBe('stack-name-2');
            });

            test('delete task is created for previously tracked task', async () => {
                await command.performCommand(commandArgs);
                expect(buildTaskProviderCreateDeleteTaskMock).toHaveBeenCalledTimes(1);
                expect(buildTaskProviderCreateDeleteTaskMock).toHaveBeenCalledWith('updateStacks3', 'update-stacks', 'stack-name-3', undefined, commandArgs);
            });

            test('delete task has perform cleanup set to false', async () => {
                await command.performCommand(commandArgs);
                expect(buildTaskProviderCreateDeleteTaskMock.mock.results[0].value.performCleanup).toBeFalsy();;
            });

            test('delete task with log warnings', async () => {
                commandArgs.state = { enumTargets: jest.fn().mockReturnValue([]) } as any;
                await command.performCommand(commandArgs);

                expect(logWarningMock).toHaveBeenCalledTimes(0);
                await buildTaskProviderCreateDeleteTaskMock.mock.results[0].value.perform();

                expect(logWarningMock).toHaveBeenCalledTimes(8);
            });

            test('delete stacks command is not called', async () => {
                commandArgs.state = { enumTargets: jest.fn().mockReturnValue([]) } as any;
                await command.performCommand(commandArgs);
                await buildTaskProviderCreateDeleteTaskMock.mock.results[0].value.perform();

                expect(deleteStacksCommandPerformMock).toHaveBeenCalledTimes(0);
            })

            describe('and perform cleanup flag', () => {

                test('delete stacks command is called', async () => {
                    await command.performCommand({ ...commandArgs, performCleanup: true });
                    await buildTaskProviderCreateDeleteTaskMock.mock.results[0].value.perform();

                    expect(deleteStacksCommandPerformMock).toHaveBeenCalledTimes(1);

                    const call = deleteStacksCommandPerformMock.mock.calls[0];
                    expect(call[0].stackName).toBe('stack-name-3');
                })
                test('delete task with not log warnings', async () => {
                    await command.performCommand({ ...commandArgs, performCleanup: true });
                    await buildTaskProviderCreateDeleteTaskMock.mock.results[0].value.perform();


                    expect(logWarningMock).toHaveBeenCalledTimes(0);
                    await buildTaskProviderCreateDeleteTaskMock.mock.results[0].value.perform();

                    expect(logWarningMock).toHaveBeenCalledTimes(0);
                });

                test('info message is logged', async () => {
                    await command.performCommand({ ...commandArgs, performCleanup: true });
                    await buildTaskProviderCreateDeleteTaskMock.mock.results[0].value.perform();

                    expect(logInfoMock).toHaveBeenCalledTimes(1);
                    expect(logInfoMock).toHaveBeenCalledWith(expect.stringContaining('stack-name-3'));
                    expect(logInfoMock).toHaveBeenCalledWith(expect.stringContaining('delete'));
                });
            });
        });
    });
});

describe("when running perform-tasks with taskMatchers", () => {
    
    let commandArgs: IPerformTasksCommandArgs;
    let taskConfig: IUpdateOrganizationTaskConfiguration[];
    let performTaskState:PersistedState;
    let buildRunnerRunTasksMock: jest.SpyInstance;
    let commanderCommand:Command;
    let command: PerformTasksCommand;
    
    
    beforeEach(() => {
        commandArgs = {
            maxConcurrentStacks:1,
            maxConcurrentTasks:1,
            failedStacksTolerance:0,
            failedTasksTolerance:0,
            tasksFile: 'tasks.yml',
            logicalName: 'default',
        } as IPerformTasksCommandArgs
        
        taskConfig = [{
            Type: 'update-organization',
            LogicalName: 'updateOrg',
            Template: 'organization.yml',
        } as IUpdateOrganizationTaskConfiguration]
        jest.spyOn(BuildConfiguration.prototype, 'enumBuildConfiguration').mockReturnValue(taskConfig);
        
        performTaskState = PersistedState.CreateEmpty('123123123123');
        jest.spyOn(PerformTasksCommand.prototype, 'getState').mockReturnValue(Promise.resolve(performTaskState));
        jest.spyOn(BuildConfiguration.prototype, 'fixateOrganizationFile').mockReturnValue(Promise.resolve(undefined));
        
        buildRunnerRunTasksMock = jest.spyOn(BuildRunner, 'RunTasks').mockImplementation();
        
        commanderCommand = new Command('root');
        command = new PerformTasksCommand(commanderCommand);
        
    })
    
    afterEach(() => {
        jest.restoreAllMocks();
    })
    
    test("No taskMatchers",async () => {
        const tasks = [{
            name: 'updateOrg',
            type: 'update-organization',
            childTasks: [],
            skip: undefined
        }] as IBuildTask[];
        jest.spyOn(BuildConfiguration.prototype, 'enumBuildTasks').mockReturnValue(tasks);
        
        await command.performCommand({ ...commandArgs, match:undefined});
        
        const expectedTask = [{
            name: 'updateOrg',
            type: 'update-organization',
            childTasks: [],
            skip: undefined,
        }] as IBuildTask[];
        expect(buildRunnerRunTasksMock).toBeCalledWith(expectedTask, false, 1, 0);
    })

    test.each([
        //globMatcher, [updateOrg, node1, leaf2, leaf11, leaf12], [updateOrg, node1, leaf2, leaf11, leaf12]],
        ["test", [,,,,], [true,true,true,true,true]],
        ["", [,,,,], [,,,,]], // "" is falsy, thus no matching.
        ["*", [,,,,], [true,true,true,true,true]],
        ["*/*", [,,,,], [false,true,false,true,true]],
        ["*/**", [,,,,], [false,false,false,false,false]],
        ["**", [,,,,], [false,false,false,false,false]],
        ["updateOrg/**", [,,,,], [false,false,false,false,false]],
        ["updateOrg/nodeTask1/**", [,,,,], [false,false,true,false,false]],
        ["updateOrg/nodeTask1", [,,,,], [true,true,true,true,true]],
        ["updateOrg/nodeTask1/*", [,,,,], [false,false,true,false,false]],
        ["updateOrg/leafTask2", [,,,,], [false,true,false,true,true]],
        ["updateOrg/nodeTask", [,,,,], [true,true,true,true,true]],
        ["updateOrg/leafTask", [,,,,], [true,true,true,true,true]],
        ["updateOrg/*Task*", [,,,,], [false,true,false,true,true]],
        ["updateOrg/**/*+(2|12)", [,,,,], [false,false,false,true,false]],
        ["updateOrg/**/*+(1|2)", [,,,,], [false,false,false,false,false]],
        ["updateOrg/**/*+(2|12)", [,,,,true], [false,false,false,true,false]], //checking unskip
        ["updateOrg/**/*Task2", [,,,,true], [false,true,false,true,true]], //checking that the top task is also skipped when no child is executed
        ["updateOrg/**/*11", [,true,,true,true], [false,false,true,false,true]], //parent is skipped but child matched, parent and child should be un-skipped.
        ["**/3", [,,,,], [true,true,true,true,true]], //parent is skipped but child matched, parent and child should be un-skipped.
        ["updateOrg/**", [,true,true,true,], [false,false,false,false,false]],
        
    ])("Task Matcher is present: %s", async (match, skipTasks, skippedTasks) => {
        
        const [updateOrgSkip, nodeTask1Skip, leafTask2Skip, leafTask11Skip, leafTask12Skip] = skipTasks
        const tasks = [{
            name: 'updateOrg',
            type: 'update-organization',
            skip: updateOrgSkip,
            childTasks: [{
                name: "nodeTask1",
                type: "update-stacks",
                skip: nodeTask1Skip,
                childTasks: [{
                    name: "leafTask11",
                    type: "update-stacks",
                    skip: leafTask11Skip,
                    childTasks:[]
                },{
                    name: "leafTask12",
                    type: "update-stacks",
                    skip: leafTask12Skip,
                    childTasks:[]
                }]
            },{
                name: "leafTask2",
                type: "update-stacks",
                skip: leafTask2Skip,
                childTasks: []
            }]
        }] as IBuildTask[];
        jest.spyOn(BuildConfiguration.prototype, 'enumBuildTasks').mockReturnValue(tasks);
        
        await command.performCommand({ ...commandArgs, match});
        
        const [skippedUpdateOrg, skippedNodeTask1, skippedLeafTask2, skippedLeafTask11, skippedLeafTask12] = skippedTasks
        const expectedTask = [{
            name: 'updateOrg',
            type: 'update-organization',
            skip: skippedUpdateOrg,
            childTasks: [{
                name: "nodeTask1",
                type: "update-stacks",
                skip: skippedNodeTask1,
                childTasks:[{
                    name: "leafTask11",
                    type: "update-stacks",
                    skip: skippedLeafTask11,
                    childTasks:[]
                },{
                    name: "leafTask12",
                    type: "update-stacks",
                    skip: skippedLeafTask12,
                    childTasks:[]
                }]
            },{
                name: "leafTask2",
                type: "update-stacks",
                skip: skippedLeafTask2,
                childTasks: []
            }]
        }] as IBuildTask[];
        expect(buildRunnerRunTasksMock).toBeCalledWith(expectedTask, false, 1, 0);
    })
    
})