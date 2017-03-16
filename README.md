# grunt-ssh-deploy-release

Deploy releases over SSH with rsync or gzip archive.


```
/deployPath
    |
    ├── www --> symlink to ./releases/<currentRelease>
    |
    ├── releases
    |   ├── 2017-02-08-17-14-21-867-UTC
    |   ├── ...
    |   └── 2017-02-09-18-01-10-765-UTC
    |       ├── ...
    |       └── logs --> symlink to shared/logs
    |
    └── shared
        └── logs                    
```


- [Installation](#installation)
- [Grunt configuration](#grunt-configuration)
- [Execute](#execute)
- [Options](#options)
- [Examples](#examples)




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
            'upload': {
                symlink: 'app/upload',
                mode:    '777',
            },
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
See `allowRemove` option on ssh-deploy-release.


### Enable debug
Set ``debug`` option to `true` 


## Options

`grunt-ssh-deploy-release` use `ssh-deploy-release` package.

See available options on https://github.com/la-haute-societe/ssh-deploy-release 
