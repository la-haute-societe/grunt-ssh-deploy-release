module.exports = function (grunt) {
	'use strict';

	grunt.registerTask('ssh-deploy-release', 'Begin Deployment', function () {

		// Dependencies
		var path = require('path');
		var fs = require('fs');
		var done = this.async();
		var Connection = require('ssh2');
		var client = require('scp2');
		var moment = require('moment');
		var timestamp = moment().utc().format('YYYY-MM-DD-HH-mm-ss-SSS-UTC');
		var async = require('async');
		var extend = require('extend');
		var filesize = require('filesize');

		// Default options
		var defaultOptions = {
			// SSH / SCP connection
			port: 22,
			host: '',
			username: '',
			password: '',
			deployPath: '',
			readyTimeout: 20000,

			// Folders / link
			currentReleaseLink: 'www',
			sharedFolder: 'shared',
			releasesFolder: 'releases',
			localPath: 'www',

			// Release
			archiveName: 'release.zip',
			releasesToKeep: '3',
			tag: timestamp,

			// Excluded files
			exclude: [],

			// Folders to share
			share: {},

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

			async.series([
				onBeforeDeployTask,
				compressReleaseTask,
				connectToRemoteTask,
				createReleaseFolderOnRemoteTask,
				uploadReleaseTask,
				decompressArchiveOnRemoteTask,
				onBeforeLinkTask,
				updateSharedSymbolicLinkOnRemoteTask,
				updateCurrentSymbolicLinkOnRemoteTask,
				onAfterDeployTask,
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
			if (options.privateKey) {
				scpOptions.privateKey = options.privateKey;
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
			var command = [
				'mkdir -p ' + releasePath + '/' + target,
				'mkdir -p ' + link,
				'rm -rf ' + link,
				'cd ' + releasePath,
				'ln -nfs ' + target + ' ' + link
			].join(' && ');

			execRemote(command, options.debug, function () {
				grunt.log.ok('Done');
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
		 * Zip folder
		 * @param callback
		 * @returns {*}
		 */
		function compressReleaseTask(callback) {

			grunt.log.subhead('Compress release');

			var archiver = require('archiver');
			var archive = archiver.create('zip', {});


			var output = fs.createWriteStream(options.archiveName);
			var archive = archiver('zip');

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
			grunt.log.ok(releasePath);

			execRemote(command, options.debug, function () {
				grunt.log.ok('Done');
				callback();
			});
		}

		/**
		 *
		 * @param callback
		 */
		function uploadReleaseTask(callback) {
			var build = options.archiveName;

			grunt.log.subhead('Upload release to remote');
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
		 * Unzip on remote
		 * @param callback
		 * @returns {*}
		 */
		function decompressArchiveOnRemoteTask(callback) {
			var goToCurrent = "cd " + releasePath;
			var untar = "unzip -q " + options.archiveName;
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
		 * Update shared symlink
		 * @param callback
		 */
		function updateSharedSymbolicLinkOnRemoteTask(callback) {

			grunt.log.subhead('Update shared symlink on remote');

			async.eachSeries(Object.keys(options.share), function (currentSharedFolder, callback) {
				var linkPath = releasePath + '/' + options.share[currentSharedFolder];
				var upwardPath = getReversePath(options.share[currentSharedFolder]);
				var target = upwardPath + '/../' + options.sharedFolder + '/' + currentSharedFolder;

				grunt.log.writeln(' - ' + options.share[currentSharedFolder] + ' ==> ' + currentSharedFolder);
				createSymboliclink(target, linkPath, callback);
			}, callback);
		}


		/**
		 * Update symlink
		 * @param callback
		 */
		function updateCurrentSymbolicLinkOnRemoteTask(callback) {
			var deleteSymlink = 'rm -rf ' + getCurrentPath();
			var setSymlink = 'ln -s ' + releasePath + ' ' + getCurrentPath();
			var command = deleteSymlink + ' && ' + setSymlink;

			grunt.log.subhead('Update current release symlink on remote');
			execRemote(command, options.debug, function () {
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

	});
};
