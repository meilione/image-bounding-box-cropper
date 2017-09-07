/*
* Image bounding box cropper and resizer
*
* Description:
*
* Author: Yves Meili
* Date: 2017-09-07
*/

var path = require('path');
var mkdirp = require('mkdirp');
var async = require('async');
const svg2png = require("svg2png");
var unique = require('array-unique');
var fs = require('fs')
  , gm = require('gm').subClass({imageMagick: false});

var innerWidth  = 600;
var innerHeight = 600;

var borderThicknessX = 20;
var borderThicknessY = borderThicknessX;

var outterWidth = null;
var outterHeight = null;

var square = false;
var grayscale = true;

var trimFuzz = 5;
var trimFuzzPercentage = 80;

var scaleUp = true; //if true then it scales half of the images up

var inputFolder  = __dirname + '/data';
var outputFolder = __dirname + '/output';

var outPrefix = ''; //opt_

var filesToProcess = [];

var asyncLimit = 10;

var allowedExt = ['.png','.jpg','.jpeg','.gif','.svg'];

/*
* Process
*/
createOutputFolder()
  .then(loadFiles)
  .then(getImageSizes)
  .then(convert)

/*
* Folder Processing
*/
function createOutputFolder() {
  if (!fs.existsSync(outputFolder)) {
    mkdirp(outputFolder, function(err) { 
      console.log('Error creating output folder: ' + outputFolder + ' ' + err);
    });
  }
  return Promise.resolve();
}

function loadFiles() {
  return new Promise(function (resolve,reject) {
    var folderFiles = fs.readdirSync(inputFolder);
    async.eachLimit(folderFiles, asyncLimit, function (file, callback) {

      var fileExt = path.extname(inputFolder + '/' + file).toLowerCase();

      if (!file) {
        callback();
        return;
      }
      if (fs.lstatSync(inputFolder + '/' + file).isDirectory()) {
        callback();
        return;
      }

      if (allowedExt.indexOf(fileExt) === -1) {
        callback();
        return;
      }

      //convert svgs to images
      if (fileExt == '.svg') {
        var tmpIn = inputFolder + '/' + file;
        var tmpOut = inputFolder + '/' + file.replace('.svg','.png');
        const outputBuffer = svg2png.sync(fs.readFileSync(tmpIn), { width: innerWidth, height: innerHeight});
        fs.writeFileSync(tmpOut, outputBuffer);
        file = file.replace('.svg','.png');
      }

      filesToProcess.push(file);
      callback();

    }, function (err, results) {
      unique(filesToProcess);
      resolve(filesToProcess);
    });
  });
}

/*
* Image Processing
*/
function convert() {
  console.log('innerWidth: ' + innerWidth);
  console.log('innerHeight: ' + innerHeight);

  if (square) {
    innerWidth = Math.max(innerWidth,innerHeight);
    innerHeight = Math.max(innerWidth,innerHeight);
  }

  outterWidth  = innerWidth + (2 * borderThicknessX); 
  outterHeight = innerHeight + (2 * borderThicknessY); 

  processImages();

}

function getImageSizes() {
  return new Promise(function (resolve, reject) {

    console.log('Calculating largest bounding box: Getting Image Sizes');

    var filesStats = {files: [], sizesW: [], sizesH: []};

    async.filterLimit(filesToProcess, asyncLimit, function (file, callback) {
      file = inputFolder + '/' + file;
      trimImage(file).then(function (file) {
        if (!file) {
          callback('file not available');
        }
        gm(file).size(function (err, sz) {
          filesStats.files.push(file);
          filesStats.sizesW.push(sz.width);
          filesStats.sizesH.push(sz.height);
          callback(null, true);
        });
      });
    }, function (err, results) {

      filesStats.sizesH.sort(function(a, b){return a-b});
      filesStats.sizesW.sort(function(a, b){return a-b});

      //get 
      if (scaleUp) {
        var middlePointer = Math.ceil(filesStats.sizesW.length/2-1);
        innerWidth = filesStats.sizesW[middlePointer];
        innerHeight = filesStats.sizesH[middlePointer];
      } else {
        innerWidth = filesStats.sizesW[0];
        innerHeight = filesStats.sizesH[0];
      }

      //remove files
      for (idx in filesStats.files) {
        fs.unlink(filesStats.files[idx]);
      }

      resolve();
    });

  });
}

function processImages() {
  for (idx in filesToProcess) {
    var fileName     = filesToProcess[idx];
    var currentImage = inputFolder + '/' + fileName;
    var outputImage  = outputFolder + '/' + outPrefix + fileName;
    convertImage(currentImage, outputImage);
  }
}

function convertImage(currentImage, outputImage) {

  var img = gm(currentImage)
    .fuzz(trimFuzz, trimFuzzPercentage)
    .trim()
    .resize(innerWidth, innerHeight, '\>')
    .noProfile();

  if (grayscale) {
    img.colorspace('gray');
  }

  img.out('-gravity');
  img.out('center');
  img.extent(outterWidth, outterHeight);

  img.write(outputImage, function (err) {
    if (err) { 
      console.log(err);
    }
  });

}

function trimImage(image) {
  return new Promise(function (resolve, reject) {
    var tmpImagePath = outputFolder + '/cropped_' + path.basename(image);
    var img = gm(image)
      .fuzz(trimFuzz, trimFuzzPercentage)
      .trim()
      .noProfile();
    img.write(tmpImagePath, function (err) {
      if (err) { 
        console.log(err);
        reject(err);
      }
      resolve(tmpImagePath);
    });
  });
}
