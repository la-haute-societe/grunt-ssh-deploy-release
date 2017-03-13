module.exports = function (grunt) {
    'use strict';

    grunt.registerTask('ssh-deploy-release', 'Begin Deployment', function () {

        const done     = this.async();
        const extend   = require('extend');
        const deployer = require('ssh-deploy-release');

        // Merge options
        var options = extend(
            {},
            grunt.config.get('ssh-deploy-release').options,
            grunt.config.get('ssh-deploy-release')[this.args]['options']
        );

        // Action
        if (grunt.option('remove')) {
            deployer.removeRelease(options, () => done());
        }
        else {
            deployer.deployRelease(options, () => done());
        }

    });
};
