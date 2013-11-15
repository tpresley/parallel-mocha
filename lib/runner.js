var spawn = require('child_process').spawn
  , fs = require('fs')
  , p = require('path')
  , _ = require('underscore');

var Pool = require('./pool');

function Runner(paths, config) {
  var self = this;
  var title = '';
  self.files = [];
  self.data = null;
  self.index = ~~((config.index - 1) * config.repeat);
  
  if(config.repeat > 1) {
    title += 'repeat: '+config.repeat+' ';
  }
  if(config.processes > 1) {
    title += 'processes: '+config.processes+' ';
  }
  if(config.stagger > 0) {
    title += 'stagger: '+config.stagger+' ';
  }
  title += 'timeout: '+config.timeout+' ';
  if(config.data) {
    title += 'data: '+config.data+' ';
    self.data = require(process.env.APP_HOME + '/' + config.data);
  }
  console.log(title);

  _.range(config.repeat).forEach(function() {
    for(var p in paths) {
      var path = paths[p];
      var pathFiles = fs.readdirSync(path);
      for(var f in pathFiles) {
        var file = pathFiles[f];
        if(file.indexOf('.') !== 0) {
          self.files.push(path + '/' + file);
        }
      }
    }
  });
  self.config = config;
  self.mocha = null;
  self.exitCodes = [];
  self.errOutput = [];
}

Runner.prototype.run = function(callback) {
  var self = this
    , pool = new Pool(self.files, self.config.processes);

  pool.on('done', function() {
    var error
      , errorCount = 0
      , totalCount = 0;

    _.each(self.exitCodes, function(code) {
      if(code !== 0) {
        errorCount++;
      }
      totalCount++;
    });

    console.log('');
    console.log(self.errOutput.join("\n"));

    return callback({total: totalCount, errors: errorCount});
  });

  pool.on('ready', function(file, callback) {
    var row;
    if (self.data && self.data[self.index]) {
      row = self.data[self.index++];
    }
    self.spawn(file, row, callback);
  });
  pool.start();
};

Runner.prototype.spawn = function(file, row, callback) {
  var self = this
    , mocha = self.findMocha()
    , optionNames = ['timeout','slow', 'reporter', 'require', 'compilers']
    , args = [];

  for (var i in optionNames) {
    var option = optionNames[i];
    if(self.config[option]) {
      args.push('--'+option);
      args.push(self.config[option]);
    }
  };
  if (row) {
    process.env.DATA = JSON.stringify(row);
  }
  args.push(file);

  var child;
  var delay = self.config.stagger ? ~~(Math.random() * self.config.stagger * 1000) : 0;
  setTimeout(function(){
    var out = '';

    child = spawn(mocha, args, {customFds: [0,2,2], env: process.env});

    child.on('exit', function(code) {
      var output = (code === 0) ? '.' : 'x';
      process.stdout.write(output);
      self.exitCodes.push(code);
      if (code !== 0) {
        self.errOutput.push(out);
      }
      callback(code);
    });

  }, delay);

};

Runner.prototype.findMocha = function() {
  if (!this.mocha) {
    this.mocha = _.find(this.config.bin, function(bin) {
      return fs.existsSync(bin);
    });
    this.mocha = this.mocha || 'mocha';
  }

  return this.mocha;
};

module.exports = Runner;
