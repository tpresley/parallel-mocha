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
  self.index = ~~((config.index - 1) * config.repeat) + config.offset;
  self.testsStarted = 0;
  
  if(config.repeat > 1) {
    title += 'repeat: '+config.repeat+' ';
  }
  if(config.processes > 1) {
    title += 'processes: '+config.processes+' ';
  }
  if(config.stagger > 0) {
    title += 'stagger: '+config.stagger+' ';
  }
  title += 'timeout: '+(~~(config.timeout/1000))+' ';
  if(config.data) {
    title += 'data: '+config.data+' ';
    self.data = require(process.env.APP_HOME + '/' + config.data);
  }
  if (!config.raw) {
    console.log(title);
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

    if (!self.config.raw) {
      console.log('');
      console.log(self.errOutput.join("\n"));
    }

    return callback({total: totalCount, errors: errorCount});
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

  var child;
  var delay = 0;
  if (self.config.stagger) {
   delay = (self.testsStarted < self.config.processes) ? ~~(Math.random() * self.config.stagger * 1000) : 1000;
  }

  setTimeout(function(){
    var testNumber = self.index;
    self.index++;
    self.testsStarted++;

    var row;
    if (self.data && self.data[testNumber]) {
      row = self.data[testNumber];
    }

    var out = '[' + self.config.index + ':' + testNumber + ':LOG]\n'
      , tags;

    if (row) {
      process.env.DATA = JSON.stringify(row);
    }

    if (!self.config.raw) {
      process.stderr.write('[' + self.config.index + ':' + testNumber + ':START]\n');
    }
    
    child = spawn(mocha, args, {env: process.env});
    child.stdout.on('data', function(data){
      if (self.config.raw) {
        process.stdout.write(data);
      } else {
        out += data;
      }
    });
    child.stderr.on('data', function(data){
      if (self.config.raw) {
        process.stderr.write(data);
      } else {
        var str = data.toString();
        if (str.substring(0,5) === 'TAGS:') {
          process.stderr.write('[' + self.config.index + ':' + testNumber + ':TAGS] ' + str.substring(6));
        } else {
          process.stderr.write('[' + self.config.index + ':' + testNumber + ':ERR] ' + str);
        }
      }
    });

    child.on('exit', function(code) {
      if (!self.config.raw) {
        var output = (code === 0) ? '.' : 'x';
        process.stdout.write(output);
        self.exitCodes.push(code);
        if (code !== 0) {
          self.errOutput.push(out);
        }
        var result = (code === 0) ? 'PASSED' : 'FAILED';
        process.stderr.write('[' + self.config.index + ':' + testNumber + ':DONE]' + result + '\n');
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
