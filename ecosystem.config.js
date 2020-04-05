module.exports = {
    apps: [{
        name: 'cron',
        script: 'cron.js',
        instances: 1,
        exec_mode: "fork"
    }]
};
