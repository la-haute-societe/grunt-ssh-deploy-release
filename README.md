# grunt-ssh-deploy-release

Create an archive of "localPath" (except excluded folders). 

Copy this archive to the remote server using SCP. 

Decompress the release on remote server. 

Create "shared" folders symlink. 

Create release symlink. 

Clean temporary files and old releases.


## TOC
- [Installation](#installation)
- [Grunt configuration](#grunt-configuration)
- [Execute](#execute)
- [Options](#options)
- [Examples](#examples)
- [Known issues](#known-issues)


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
        
        // Create folder + make writable
        create: [
        	'tmp',
        	'logs'
        ],
        
        // Make writable folders
        makeWritable: [
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

## Execute

### Deploy to "environmentName"
```
grunt ssh-deploy-release:environmentName
```

### Remove release
```
grunt ssh-deploy-release:environmentName --remove
```
See `allowRemove` option.


### Enable debug
Use `--debug` option :
```
grunt ssh-deploy-release:environmentName --debug
```


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


#### deleteLocalArchiveAfterDeployment
Delete the local archive after the deployment. 

Default : true

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


#### makeWritable
List of files to make writable on the remote server. (chmod ugo+w)


#### makeExecutable
List of files to make executable on the remote server. (chmod ugo+x)


#### allowRemove
If true, the remote release folder can be deleted with `--remove` cli parameter.

Default: false



### Callback

##### Deployer object
The following object is passed to ``onXXXDeploy`` functions :
```js
{
    // Current configuration
    options: { ... },
    
    // Current release name
    releaseTag: '2017-01-25-08-40-15-138-UTC',
    
    // Current release path on the remote server
    releasePath: '/opt/.../releases/2017-01-25-08-40-15-138-UTC',
    
    // Use this function to execute some commands on the remote server
    execRemote: [Function: execRemote] 
}
```

##### Example with onXXXDeploy
*onBeforeDeploy, onBeforeLink, onAfterDeploy options.*

You have to call ``callback`` function to continue deployment process.

```js
onAfterDeploy: (deployer, callback) => {
    const command = 'pwd';
    const showLog = false;
    deployer.execRemote(command, showLog, callback);
}
```

##### Example with onXXXDeployExecute
*onBeforeDeployExecute, onBeforeLinkExecute, onAfterDeployExecute options.*

```js
onAfterDeployExecute: [
    'do something on the remote server',
    'and another thing'
]
```

**Or** with a function :

```js
onAfterDeployExecute: (deployer) => {
    grunt.log.subhead('Doing something');
    return [
        'do something on the remote server',
        'and another thing'
    ];
}
```

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



## Examples

## Restart Apache after deployment
```js
grunt.config.set('ssh-deploy-release', {
    options: {
        localPath: 'public',
    },
    
    production: {
        options: {
            host: 'hostname',
            username: 'username',
            password: 'password',
            deployPath: '/opt/path/to'
        }
    },
    
    onAfterDeployExecute: (deployer) => {
        grunt.log.subhead('Restart php-fpm and apache');
        return [
            'sudo /opt/bitnami/ctlscript.sh restart apache'
        ];
    }
});


```
## Dynamic environments

For example, create one environement by git branch.

```js
grunt.config.set('ssh-deploy-release', {
    options: {
        localPath: 'public',
    },
    
    review: {
        options: {
            host: 'hostname',
            username: 'username',
            password: 'password',
            deployPath: '/opt/path/to/' + grunt.option('branch'),
            allowRemove: true
        }
    },
});
```

### Deploy a branch 
```
grunt ssh-deploy-release:review --branch="BRANCH_NAME"
```

### Remove a branch on the remote server
```
grunt ssh-deploy-release:review --branch="BRANCH_NAME" --remove
```
 > In order to avoid mistakes (remove production..), ``allowRemove`` must be true to remove release on the remote server


### Plug it with Gitlab CI to deploy review app

Example of ``.gitlab-ci.yml`` :

```
 Deploy review:
    stage: deploy
    except:
     - preproduction
     - production
    environment:
      name: review/$CI_BUILD_REF_SLUG
      url: http://host/$CI_BUILD_REF_SLUG/www/
      on_stop: stop_review
    script:
     - yarn
     - grunt ssh-deploy-release:review --branch="$CI_BUILD_REF_SLUG"


  stop_review:
    stage: deploy
    script:
     - yarn
     - grunt ssh-deploy-release:review --branch="$CI_BUILD_REF_SLUG" --remove
    when: manual
    variables:
      GIT_STRATEGY: none
    except:
     - preproduction
     - production
    environment:
      name: review/$CI_BUILD_REF_SLUG
      action: stop
```


## Known issues
 
### Command not found or not executed

A command on a callback method is not executed or not found. 
Try to add `set -i && source ~/.bashrc &&` before your commmand : 

```
onAfterDeployExecute:[
    'set -i && source ~/.bashrc && my command'
]
```

See this issue : https://github.com/mscdex/ssh2/issues/77