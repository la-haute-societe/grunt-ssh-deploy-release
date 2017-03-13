module.exports = function (grunt) {
    'use strict';

    grunt.registerTask('ssh-deploy-release', 'Begin Deployment', function () {

        // Dependencies
        const path = require('path');
        const fs = require('fs');
        const done = this.async();
        const Connection = require('ssh2');
        const client = require('scp2');
        const moment = require('moment');
        const timestamp = moment().utc().format('YYYY-MM-DD-HH-mm-ss-SSS-UTC');
        const async = require('async');
        const extend = require('extend');
        const filesize = require('filesize');
        const exec = require('child_process').exec;

        // Default options
        var defaultOptions = {
            // Deployment mode ('archive' or 'synchronize')
            mode: 'archive',
            archiveName: 'release.tar.gz',

            // Archive type : 'zip' or 'tar'
            archiveType: 'tar',
            gzip: {
                gzip: true,
                gzipOptions: {
                    level: 5
                }
            },
            deleteLocalArchiveAfterDeployment : true,

            // SSH / SCP connection
            port: 22,
            host: '',
            username: '',
            password: '',
            privateKeyFile: null,
            readyTimeout: 20000,

            // Folders / link
            currentReleaseLink: 'www',
            sharedFolder: 'shared',
            releasesFolder: 'releases',
            localPath: 'www',
            deployPath: '',
            synchronizedFolder: 'synchronized',
            rsyncOptions: '',

            // Release
            releasesToKeep: '3',
            tag: timestamp,

            // Excluded files
            exclude: [],

            // Folders to share
            share: {},

            // Directories to create
            create: [],

            // File to make writable
            makeWritable: [],

            // Files to make executable
            makeExecutable: [],

            // Allow remove release on remote
            // Warning !!
            allowRemove: false,

            // Callback
            onBeforeDeploy: function (deployer, callback) {
                callback();
            },
            onBeforeLink: function (deployer, callback) {
                callback();
            },
            onAfterDeploy: function (deployer, callback) {
                callback();
            },
            // Callback commands
            onBeforeDeployExecute: function (deployer) {
                return [];
            },
            onBeforeLinkExecute: function (deployer) {
                return [];
            },
            onAfterDeployExecute: function (deployer) {
                return [];
            },
        };
        var task = this;
        var options = getConfiguration();
        var releaseTag = getReleaseTag();
        var releasePath = getReleasePath();
        var connection = null;
        var deployer = {
            options: options,
            releaseTag: releaseTag,
            releasePath: releasePath,
            execRemote: execRemote,
        };

        // GO !
        init();

        /**
         * Initialize
         */
        function init() {
            client.defaults(getScpOptions(options));

            // Private key authentication
            // Read file
            if (options.privateKeyFile) {
                options.privateKey = grunt.file.read(options.privateKeyFile);
            }

            if(grunt.option('remove')) {
                removeRelease();
            }
            else {
                deployRelease();
            }
        }

        /**
         * Remove release on remote
         */
        function removeRelease() {

            if( ! options.allowRemove) {
                grunt.fail.fatal('Remove release is not allowed. (check "allowRemove" option)');
                return;
            }

            async.series([
                connectToRemoteTask,
                removeReleaseTask,
                closeConnectionTask
            ], function () {
                done();
            });
        }

        /**
         * Launch release deployment
         */
        function deployRelease() {
            async.series([
                onBeforeDeployTask,
                onBeforeDeployExecuteTask,
                compressReleaseTask,
                connectToRemoteTask,
                createReleaseFolderOnRemoteTask,
                uploadArchiveTask,
                uploadReleaseTask,
                decompressArchiveOnRemoteTask,
                onBeforeLinkTask,
                onBeforeLinkExecuteTask,
                updateSharedSymbolicLinkOnRemoteTask,
                createFolderTask,
                makeDirectoriesWritableTask,
                makeFilesExecutableTask,
                updateCurrentSymbolicLinkOnRemoteTask,
                onAfterDeployTask,
                onAfterDeployExecuteTask,
                remoteCleanupTask,
                deleteLocalArchiveTask,
                closeConnectionTask
            ], function () {
                done();
            });
        }

        /**
         * Return configuration
         * merge deafult prop
         */
        function getConfiguration() {
            var options = extend(
                {},
                defaultOptions,
                grunt.config.get('ssh-deploy-release').options,
                grunt.config.get('ssh-deploy-release')[task.args]['options']
            );

            // Fix : "writeable" is an alias of "writable"
            if(options.writeable) {
                options.writable = options.writeable;
            }

            return options;
        }


        /**
         * Get SCP options
         * @param options
         * @returns {{port: number, host: (*|string|string|string|string), username: (*|string|string|string), readyTimeout: number}}
         */
        function getScpOptions(options) {
            var scpOptions = {
                port: options.port,
                host: options.host,
                username: options.username,
                readyTimeout: options.readyTimeout
            };

            // Private key authentication
            if (options.privateKeyFile) {
                scpOptions.privateKey = grunt.file.read(options.privateKeyFile);
                if (options.passphrase) {
                    scpOptions.passphrase = options.passphrase;
                }
            }

            // Password authentication
            else if (options.password) {
                scpOptions.password = options.password;
            }

            // Agent authentication
            else if (options.agent) {
                    scpOptions.agent = options.agent;
                }

                // No authentication
                else {
                    throw new Error('Agent, password or private key required for secure copy.');
                }

            return scpOptions;
        }


        /**
         * Get release tag
         * @returns {*|string}
         */
        function getReleaseTag() {
            var releaseTag = options.tag;
            if (typeof options.tag == 'function') {
                releaseTag = options.tag()
            }

            // Just a security check, avoiding empty tags that could mess up the file system
            if (releaseTag == '') {
                releaseTag = defaults.tag;
            }
            return releaseTag;
        }


        /**
         * Get releases path
         * @returns {string}
         */
        function getReleasePath() {
            return path.posix.join(
                options.deployPath,
                options.releasesFolder,
                releaseTag
            );
        }

        /**
         * Executes a remote command via ssh
         */
        function execRemote(cmd, showLog, next) {
            connection.exec(cmd, function (error, stream) {
                if (error) {
                    grunt.log.errorlns(error);
                    grunt.log.error('Error while deploying..');
                    deleteRemoteRelease(closeConnectionTask);
                }

                stream.on('data', function (data, extended) {
                    if(showLog) {
                        grunt.log.write((extended === 'stderr' ? 'STDERR: ' : 'STDOUT: ') + data);
                        return;
                    }

                    grunt.log.debug((extended === 'stderr' ? 'STDERR: ' : 'STDOUT: ') + data);
                });

                stream.on('end', function () {
                    grunt.log.debug('Remote command : ' + cmd);
                    if (!error) {
                        next();
                    }
                });
            });
        }

        /**
         * Get current folder path on remote
         * @returns {string}
         */
        function getCurrentPath() {
            return path.posix.join(options.deployPath, options.currentReleaseLink);
        }


        /**
         * Delete release
         * @param callback
         */
        function deleteRemoteRelease(callback) {
            var command = 'rm -rf ' + releasePath;
            grunt.log.subhead('Delete release on remote');
            execRemote(command, options.debug, function () {
                grunt.log.ok('Done');
                callback();
            });
        }

        /**
         * Create symbolic link
         * @param target
         * @param link
         * @param callback
         */
        function createSymboliclink(target, link, callback) {
            var commands = [
                'mkdir -p ' + link, // Create the parent of the symlink target
                'rm -rf ' + link,
                'mkdir -p ' + realpath(link + '/../' + target), // Create the symlink target
                'ln -nfs ' + target + ' ' + link
            ];

            async.eachSeries(commands, function (command, itemCallback) {
                execRemote(command, options.debug, function () {
                    itemCallback();
                });
            }, callback);
        }

        /**
         * Return upwardPath from downwardPath
         * @example return "../../.." for "path/to/something"
         * @param downwardPath
         * @returns {XML|string|void|*}
         */
        function getReversePath(downwardPath) {
            var upwardPath = downwardPath.replace(/([^\/]+)/g, '..');
            return upwardPath;
        }

        /**
         * Realpath
         * @param path
         * @returns {string}
         */
        function realpath (path) {
            var arr = [] // Save the root, if not given

            // Explode the given path into it's parts
            arr = path.split('/') // The path is an array now
            path = [] // Foreach part make a check
            for (var k in arr) { // This is'nt really interesting
                if (arr[k] === '.') {
                    continue
                }
                // This reduces the realpath
                if (arr[k] === '..') {
                    /* But only if there more than 3 parts in the path-array.
                     * The first three parts are for the uri */
                    if (path.length > 3) {
                        path.pop()
                    }
                } else {
                    // This adds parts to the realpath
                    // But only if the part is not empty or the uri
                    // (the first three parts ar needed) was not
                    // saved
                    if ((path.length < 2) || (arr[k] !== '')) {
                        path.push(arr[k])
                    }
                }
            }

            // Returns the absloute path as a string
            return path.join('/')
        }

        /**
         * Execute commandsFunction results
         * @param commandsFunction function | []
         * @param callback
         */
        function businessCallbackExecute(commandsFunction, callback) {
            if( ! commandsFunction) {
                callback();
                return;
            }

            let commands = commandsFunction;

            // If commandsFunction is a function, take its result as commands
            if(typeof commandsFunction === 'function'){
                commands = commandsFunction(deployer);
            }

            // Nothing to execute
            if(!commands || commands.length == 0) {
                callback();
                return;
            }

            // Execute each command
            async.eachSeries(commands, (command, innerCallback) => {
                grunt.log.subhead('Execute on remote : ' + command);
                deployer.execRemote(command, true, innerCallback);
            }, () => {
                grunt.log.ok('Done');
                callback();
            });
        }

        function remoteChmod(path, mode, callback) {
            const command = 'chmod ' + mode + ' ' + path;

            execRemote(command, options.debug, function () {
                callback();
            });
        }


        // TASKS ==========================================

        /**
         * On before create symbolic link
         * @param callback
         * @returns {*}
         */
        function onBeforeDeployTask(callback) {
            options.onBeforeDeploy(deployer, callback);
        }

        /**
         * On before create symbolic link Execute
         * @param callback
         * @returns {*}
         */
        function onBeforeDeployExecuteTask(callback) {
            businessCallbackExecute(options.onBeforeDeployExecute, callback);
        }

        /**
         * Zip folder
         * @param callback
         * @returns {*}
         */
        function compressReleaseTask(callback) {

            if(options.mode != 'archive') {
                callback();
                return;
            }

            grunt.log.subhead('Compress release');

            var archiver = require('archiver');
            var output = fs.createWriteStream(options.archiveName);
            var archive = archiver(options.archiveType, options.gzip);

            output.on('close', function () {
                grunt.log.ok('Archive created : ' + filesize(archive.pointer()));
                callback();
            });

            archive.on('error', function (err) {
                grunt.log.error('Error while compressing');
                throw err;
            });


            archive.pipe(output);
            archive.glob('**/*', {
                expand: true,
                cwd: options.localPath,
                ignore: options.exclude,
                dot: true,
            });
            archive.finalize();
        }

        /**
         * Connect to remote
         */
        function connectToRemoteTask(callback) {
            grunt.log.subhead('Connect to ' + options.host);

            connection = new Connection();

            // Ready event
            connection.on('ready', function () {
                grunt.log.ok('Connected');
                callback();
            });

            // Error event
            connection.on('error', function (error) {
                grunt.log.error("Error : " + options.host);
                console.log(error, connection);
                grunt.log.errorlns(error);
                if (error) {
                    throw error;
                }
            });

            // Close event
            connection.on('close', function (hadError) {
                grunt.log.subhead("Closed from " + options.host);
                return true;
            });


            connection.connect(options);

            return connection;
        }

        /**
         * Create release
         * @param callback
         */
        function createReleaseFolderOnRemoteTask(callback) {
            var command = 'mkdir -p ' + releasePath;

            grunt.log.subhead('Create release folder on remote');
            grunt.log.writeln(' - ' + releasePath);

            execRemote(command, options.debug, function () {
                grunt.log.ok('Done');
                callback();
            });
        }

        /**
         *
         * @param callback
         */
        function uploadArchiveTask(callback) {

            if(options.mode != 'archive') {
                callback();
                return;
            }

            var build = options.archiveName;

            grunt.log.subhead('Upload archive to remote');
            client.scp(build, {
                path: releasePath
            }, function (error) {
                if (error) {
                    grunt.log.errorlns(error);
                    return;
                }

                grunt.log.ok('Done');
                callback();
            });
        }


        /**
         *
         * @param callback
         */
        function uploadReleaseTask(callback) {

            if(options.mode != 'synchronize') {
                callback();
                return;
            }

            grunt.log.subhead('Synchronize remote server');

            const source = options.localPath + '/';
            const target = options.username + '@' + options.host + ':' + options.deployPath + '/' + options.synchronizedFolder;
            const copy = 'rsync -a ' + options.deployPath + '/' + options.synchronizedFolder + '/ ' + releasePath;

            // Construct rsync command
            let sshpass = '';

            // Use password
            if(options.password != '') {
                sshpass = '--rsh=\'sshpass -p "' + options.password  + '" ssh -l ' + options.username + ' -o StrictHostKeyChecking=no\'';
            }

            // Use privateKey
            else if(options.privateKeyFile != null) {
                grunt.fail.fatal('PrivateKey not compatible with synchronize mode.');
            }

            // Concat
            let synchronizeCommand = 'rsync ' + sshpass + ' ' + options.rsyncOptions + ' -a --stats --delete ' + source + ' ' + target;

            // Exec !
            exec(synchronizeCommand, function(error, stdout, stderr) {
                if(error) {
                    grunt.fail.fatal(error);
                }
                grunt.log.write(stdout);
                grunt.log.write(stderr);
                grunt.log.ok('Done');

                grunt.log.subhead('Copy release');

                execRemote(copy, true, function (result) {
                    grunt.log.ok('Done');
                    callback();
                });
            });
        }


        /**
         * Unzip on remote
         * @param callback
         * @returns {*}
         */
        function decompressArchiveOnRemoteTask(callback) {

            if(options.mode != 'archive') {
                callback();
                return;
            }

            const untarMap = {
                'zip': "unzip -q " + options.archiveName,
                'tar': "tar -xvf " + options.archiveName,
            };

            // Check archiveType is supported
            if( ! untarMap[options.archiveType]) {
                grunt.fail.fatal(options.archiveType + ' not supported.');
            }

            var goToCurrent = "cd " + releasePath;
            var untar = untarMap[options.archiveType];
            var cleanup = "rm " + path.posix.join(releasePath, options.archiveName);
            var command = goToCurrent + " && " + untar + " && " + cleanup;

            grunt.log.subhead('Decompress archive on remote');
            execRemote(command, options.debug, function () {
                grunt.log.ok('Done');
                callback();
            });
        }

        /**
         * On before create symbolic link
         * @param callback
         * @returns {*}
         */
        function onBeforeLinkTask(callback) {
            options.onBeforeLink(deployer, callback);
        }


        /**
         * On before link Execute
         * @param callback
         * @returns {*}
         */
        function onBeforeLinkExecuteTask(callback) {
            businessCallbackExecute(options.onBeforeLinkExecute, callback);
        }


        /**
         * Update shared symlink
         * @param callback
         */
        function updateSharedSymbolicLinkOnRemoteTask(callback) {

            grunt.log.subhead('Update shared symlink on remote');

            async.eachSeries(Object.keys(options.share), function (currentSharedFolder, itemCallback) {
                const configValue = options.share[currentSharedFolder];
                let symlinkName   = configValue;
                let mode          = null;

                if (
                    typeof configValue == 'object'
                    && 'symlink' in configValue
                ) {
                    symlinkName = configValue.symlink;
                }

                if (
                    typeof configValue == 'object'
                    && 'mode' in configValue
                ) {
                    mode = configValue.mode;
                }

                const linkPath = releasePath + '/' + symlinkName;
                const upwardPath = getReversePath(symlinkName);
                const target = upwardPath + '/../' + options.sharedFolder + '/' + currentSharedFolder;

                grunt.log.writeln(' - ' + symlinkName + ' ==> ' + currentSharedFolder);
                createSymboliclink(target, linkPath, () => {
                    if (!mode) {
                        itemCallback();
                        return;
                    }

                    grunt.log.writeln('   chmod ' + mode);

                    remoteChmod(linkPath, mode, () => {
                        itemCallback();
                    });
                });
            }, () => {
                grunt.log.ok('Done');

                callback();
            });
        }


        /**
         * Create directories
         * @param callback
         */
        function createFolderTask(callback) {

            if (!options.create || options.create.length == 0) {
                callback();
                return;
            }

            grunt.log.subhead('Create folders on remote');

            async.eachSeries(options.create, function (currentFolderToCreate, itemCallback) {
                var path = releasePath + '/' + currentFolderToCreate;
                var command = 'mkdir ' + path + ' && chmod ugo+w ' + path;

                grunt.log.writeln(' - ' + currentFolderToCreate);
                execRemote(command, options.debug, function () {
                    itemCallback();
                });
            }, () => {
                grunt.log.ok('Done');
                callback();
            });
        }


        /**
         * Make directories writable
         * @param callback
         */
        function makeDirectoriesWritableTask(callback) {
            if (!options.makeWritable || options.makeWritable.length == 0) {
                callback();
                return;
            }

            grunt.log.subhead('Make folders writable on remote');

            async.eachSeries(options.makeWritable, function (currentFolderToMakeWritable, itemCallback) {
                const path = releasePath + '/' + currentFolderToMakeWritable;
                const mode = 'ugo+w';

                grunt.log.writeln(' - ' + currentFolderToMakeWritable);
                remoteChmod(path, mode, () => {
                    itemCallback();
                });
            }, () => {
                grunt.log.ok('Done');
                callback();
            });
        }

        /**
         * Make files executable
         * @param callback
         */
        function makeFilesExecutableTask(callback) {
            if (!options.makeExecutable || options.makeExecutable.length == 0) {
                callback();
                return;
            }

            grunt.log.subhead('Make files executables on remote');

            async.eachSeries(options.makeExecutable, function (currentFileToMakeExecutable, itemCallback) {
                var path = releasePath + '/' + currentFileToMakeExecutable;
                var command = 'chmod ugo+x ' + path;

                grunt.log.writeln(' - ' + currentFileToMakeExecutable);
                execRemote(command, options.debug, function () {
                    grunt.log.ok('Done');
                    itemCallback();
                });
            }, callback);
        }


        /**
         * Update symlink
         * @param callback
         */
        function updateCurrentSymbolicLinkOnRemoteTask(callback) {

            grunt.log.subhead('Update current release symlink on remote');

            var target = options.releasesFolder + '/' +releaseTag;

            createSymboliclink(target, getCurrentPath(), function () {
                grunt.log.ok('Done');
                callback();
            });
        }

        /**
         * On after deploy
         * @param callback
         * @returns {*}
         */
        function onAfterDeployTask(callback) {
            options.onAfterDeploy(deployer, callback);
        }


        /**
         * On after deploy Execute
         * @param callback
         * @returns {*}
         */
        function onAfterDeployExecuteTask(callback) {
            businessCallbackExecute(options.onAfterDeployExecute, callback);
        }


        /**
         * Remote cleanup
         * @param callback
         * @returns {*}
         */
        function remoteCleanupTask(callback) {
            if (typeof options.releasesToKeep === 'undefined') {
                return callback();
            }

            if (options.releasesToKeep < 1) {
                options.releasesToKeep = 1;
            }

            var command = "cd " + path.posix.join(
                    options.deployPath,
                    options.releasesFolder
                ) + " && rm -rf `ls -r " + path.posix.join(
                    options.deployPath,
                    options.releasesFolder
                ) + " | awk 'NR>" + options.releasesToKeep + "'`";

            grunt.log.subhead('Remove old builds on remote');
            execRemote(command, options.debug, function () {
                grunt.log.ok('Done');
                callback();
            });
        }

        /**
         * Delete local archive
         * @param callback
         * @returns {*}
         */
        function deleteLocalArchiveTask(callback) {

            if(options.mode != 'archive' || ! options.deleteLocalArchiveAfterDeployment) {
                callback();
                return;
            }

            grunt.log.subhead('Delete local archive');
            fs.unlink(options.archiveName);
            grunt.log.ok('Done');
            callback();
        }

        /**
         * Closing connection to remote server
         */
        function closeConnectionTask(callback) {
            connection.end();
            client.close();
            client.__sftp = null;
            client.__ssh = null;
            callback();
        }


        /**
         * Remove release on remote
         * @param callback
         */
        function removeReleaseTask(callback){
            grunt.log.subhead('Remove releases on remote');

            var command = "rm -rf " + options.deployPath;
            execRemote(command, options.debug, function () {
                grunt.log.ok('Done');
                callback();
            });
        }
    });
};
