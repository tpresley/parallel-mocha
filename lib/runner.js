var spawn = require('child_process').spawn
  , fs = require('fs')
  , p = require('path')
  , _ = require('underscore');

var Pool = require('./pool');

function Runner(paths, config) {
  var self = this;
  self.files = [];
  if(config.repeat > 1) {
    console.log('Repeating tests '+config.repeat+' times.');
  }
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
}

Runner.prototype.run = function(callback) {
  var self = this
    , pool = new Pool(self.files, self.config.processes);

  pool.on('done', function() {
    var errorCount = 0;
    var success = _.every(self.exitCodes, function(code) {
      if(code === 0) {
        return true;
      } else {
        errorCount++;
        return false;
      }
      return code === 0;
    });
    // TODO: return better result rather than just error or not
    var error = success ? null : new Error(errorCount+ ' TESTS FAILED');
    return callback(error);
  });

  pool.on('ready', function(file, callback) {
    self.spawn(file, callback);
  });
  pool.start();
};

Runner.prototype.spawn = function(file, callback) {
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
  args.push(file);

  var child = spawn(mocha, args);
  var out = '';

  child.stdout.on('data', function (data) {
    out += data;
  });
  child.stderr.on('data', function (data) {
    out += data;
  });

  child.on('exit', function(code) {
    console.log(out);
    self.exitCodes.push(code)
    callback(code, out);
  });

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
