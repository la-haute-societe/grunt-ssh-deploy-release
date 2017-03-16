module.exports = function (grunt) {
    'use strict';

    grunt.registerTask('ssh-deploy-release', 'Begin Deployment', function () {

        const done     = this.async();
        const extend   = require('extend');
        const Deployer = require('ssh-deploy-release');

        // Merge options
        var options = extend(
            {},
            grunt.config.get('ssh-deploy-release').options,
            grunt.config.get('ssh-deploy-release')[this.args]['options']
        );

        const deployer = new Deployer(options);

        // Action
        if (grunt.option('remove')) {
            deployer.removeRelease(done);
        }
        else {
            deployer.deployRelease(done);
        }

    });
};
