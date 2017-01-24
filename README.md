# grunt-ssh-deploy-release

Create an archive of "localPath" (except excluded folders). 

Copy this archive to the remote server using SCP. 

Decompress the release on remote server. 

Create "shared" folders symlink. 

Create release symlink. 

Clean temporary files and old releases.



## Installation

`npm install grunt-ssh-deploy-release`


## Grunt configuration
```js

grunt.config.set('ssh-deploy-release', {

	// Global options
	// ==============
    options: {

    	// Local folder to deploy
        localPath: 'www',

        // Excluded local folders
        exclude: [
            'tmp/**',
            'images/**',
        ],

        // Shared folders (use symlink)
        // Example : 'sharedFolder' : 'linkName'
        share: {
            'images': 'assets/images',
        },
        
        // Create folder + make writeable
        create: [
        	'tmp',
        	'logs'
        ],
        
        // Make writeable folders
        makeWriteable: [
        	'test',
        	'foo'
        ]
    },


    // Environments
    // ============

    // Preproduction
    preproduction: {
        options: {
            host: 'hostname',
            username: 'username',
            password: 'password',
            deployPath: '/opt/path/to'
        }
    },

    // Production
    production: {
        options: {
            host: 'hostname',
            username: 'username',
            password: 'password',
            deployPath: '/opt/path/to'
        }
    }
});
```

## Usage

### Deploy to "environmentName"
`grunt ssh-deploy-release:environmentName`


### Remove release
`grunt ssh-deploy-release:environmentName --remove`

See `allowRemove` option.


## Options

### SCP connection

#### port
Port used to connect to the remote server.

Default : 22

#### host
Remote server hostname.

#### username
Username used to connect to the remote server.

#### password
Password used to connect to the remote server.

#### privateKeyFile
Path to the privateKey file (see ssh2 documentation).

Default: null


#### mode
'archive' : Deploy an archive and decompress it on the remote server.

'synchronize' : Use *rsync*. Files are synchronized in the `synchronized` folder on the remote server.

Default : 'archive'


#### archiveType
'zip' : Use *zip* compression (``unzip`` command on remote)

'tar' : Use *tar gz* compression (``tar`` command on remote)

Default : 'tar'

#### archiveName
Name of the archive.

Default : 'release.tar.gz'


#### readyTimeout
SCP connection timeout duration.

Default : 20000

### Path
#### currentReleaseLink
Name of the current release symbolic link. Relative to `deployPath`.

Defaut : 'www'

#### sharedFolder
Name of the folder containing shared folders. Relative to `deployPath`.

Default : 'shared'

#### releasesFolder
Name of the folder containing releases. Relative to `deployPath`.

Default : 'releases'

#### localPath
Name of the local folder to deploy.

Default : 'www'

#### deployPath
Absolute path on the remote server where releases will be deployed.
Do not specify *currentReleaseLink* (or *www* folder) in this path.

#### synchronizedFolder
Name of the remote folder where *rsync* synchronize release.
Used when `mode` is 'synchronize'.

Default : 'www'


### Releases

#### releasesToKeep
Number of releases to keep on the remote server.

Default : 3

#### tag
Name of the release. Must be different for each release.

Default : Use current timestamp.

#### exclude
List of paths (*glob* format) to **not** deploy. Paths must be relative to `localPath`.

Default : []

#### share
List of folders to "share" between releases. A symlink will be created for each item.

Keys = Folder to share (relative to `sharedFolder`)

Values = Symlink path  (relative to release folder)

#### create
List of folders to create on the remote server.


#### makeWriteable
List of folders to make writable on the remote server. (chmod ugo+w)


#### allowRemove
If true, the remote release folder can be deleted with `--remove` cli parameter.

Default: false



### Callback

#### onBeforeDeploy
Function called before deployment. Call `callback` to continue;

Type: function(deployer, callback)


#### onBeforeDeployExecute
Array (or function returning array) of commands to execute on the remote server.

Type: function(deployer) | []


#### onBeforeLink
Function called before symlink creation. Call `callback` to continue;

Type: function(deployer, callback)


#### onBeforeLinkExecute
Array (or function returning array) of commands to execute on the remote server.

Type: function(deployer) | []


#### onAfterDeploy
Function called after deployment. Call `callback` to continue;

Type: function(deployer, callback)


#### onAfterDeployExecute
Array (or function returning array) of commands to execute on the remote server.

Type: function(deployer) | []
