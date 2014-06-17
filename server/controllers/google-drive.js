'use strict';

var fs = require('fs');
var googleapis = require('googleapis');
var qs = require('querystring');
var request = require('request');
var async = require('async');
var httpStatus = require('http-status');


function constructUrl(root, path, params) {
  var paramsString = '';
  if (params !== undefined) {
    paramsString = '?' + qs.stringify(params);
  }
  path = (path.charAt(0) === '/') ? path.substr(1) : path;
  return root + path + paramsString;
}

function getGoogleUploadUrl(file, accessToken, callback) {
  var ROOT_URL = 'https://www.googleapis.com/';
  var DRIVE_API_PATH = 'upload/drive/v2/files';
  var fileDesc = {
    title: file.originalname,
    mimeType: file.mimetype,
  };

  var params = { uploadType: 'resumable' };

  var options = {
    url: constructUrl(ROOT_URL, DRIVE_API_PATH, params),
    method: 'POST',
    headers: {
      'X-Upload-Content-Type': file.mimetype,
      'X-Upload-Content-Length': file.size,
      'Authorization': 'Bearer ' + accessToken
    },
    body: fileDesc,
    json: true
  };

  console.log('options: ', options);

  request(options, function (err, res, body) {

    if (err) {
      console.error('request error', err);
      return callback(err, null);
    }

    if (res.statusCode !== httpStatus.OK) {
      console.error('request error body: ', res.body);
      var errorMessage = 'Cannot retrieve Google Drive upload URL: ' +
                          body.error.code + ' ' +
                          body.error.messsage;
      return callback(new Error(errorMessage), null);
    }

    var uploadUrl = res.headers.location;
    callback(null, uploadUrl);
  });
}

function requestUploadStatus(file, uploadUrl, accessToken, waitFor, callback) {
  var options = {
    url: uploadUrl,
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Range': 'bytes */' + file.size
    }
  };

  setTimeout(request(options, function (err, res) {

    if (err) {
      console.error('requestUploadStatus error');
      return callback(err, 0, res.statusCode);
    }

    if (res.statusCode === 308) { // Resume Incomplete
      var range = res.headers.range;
      var uploadedSoFar = parseInt(range.split('-')[1], 10);
      callback(null, uploadedSoFar + 1, res.statusCode);
    } else {
      callback(null, 0, res.statusCode);
    }
  }), waitFor);
}


function recoverUploadToGoogle(file, uploadUrl, accessToken, callback) {
  var watingTimes = [0, 1000, 2000, 4000, 8000, 16000];
  var startFrom = 0;
  var recoverCount = 0;
  var statusCode = httpStatus.SERVICE_UNAVAILABLE;
  async.whilst(
    function () {
      return statusCode !== 308 && recoverCount < watingTimes.length;
    },
    function (callback) {
      requestUploadStatus(file, uploadUrl, accessToken, watingTimes[recoverCount], function (err, restartFrom, newStatusCode) {
        if (err) {
          return callback(err);
        }
        startFrom = restartFrom;
        statusCode = newStatusCode;
        recoverCount++;
        callback(null);
      });
    },
    function (err) {
      if (err) {
        startFrom = 0;
        return callback(err, startFrom);
      }
      if (statusCode === 308) {
        callback(null, startFrom);
      } else {
        startFrom = 0;
        callback(new Error('Google Drive is unavailable'), startFrom);
      }
    }
  );
}




// todo set a limit to a number of recovers
function uploadFileToGoogle(file, uploadUrl, accessToken, start, maxRecovers, callback) {

  var options = {
    url: uploadUrl,
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
    }
  };

  var readStream;
  if (start > 0) { // don't start from zeros byte
    readStream = fs.createReadStream(file.path, { start: start, end: file.size - 1 });
    options.headers['Content-Range'] = 'bytes ' + start + '-' + (file.size - 1) + '/' + file.size - 1;
  } else { // start from zeros byte
    readStream = fs.createReadStream(file.path);
  }

  readStream.on('open', function () {
    readStream.pipe(request(options, function (err, res) {
      if (err) {
        return callback(err, null);
      }

      console.log('google uploaded status code: ', res.statusCode);

      var recoverWhenStatus = [500, 501, 502, 503];

      var shouldRecover = recoverWhenStatus.indexOf(res.statusCode) > -1;

      if (shouldRecover && maxRecovers > 0) {
        recoverUploadToGoogle(file, uploadUrl, accessToken, function (err, startUploadFrom) {
          if (err) {
            console.error('google upload recover error: ', err);
            return callback(err, null);
          }

          uploadFileToGoogle(file, uploadUrl, accessToken, startUploadFrom, maxRecovers - 1, function (err, result) {
            if (err) {
              return callback(err, null);
            }
            callback(null, result);
          });
        });
      } else if (maxRecovers <= 0) {
        callback(new Error('excided number of recovers', null));
      } else {
        callback(null, res.body);
      }
    }));
  });

  readStream.on('error', function (err) {
    callback(err, null);
  });
}


function insertFile(file, accessToken, callback) {
  var MAX_RECOVERS_NUM = 10;

  console.log('insering file to google');
  getGoogleUploadUrl(file, accessToken, function (err, uploadUrl) {
    if (err) {
      console.error('google request error: ', err);
      return callback(err, null);
    }
    console.log('google file upload url: ', uploadUrl);
    uploadFileToGoogle(file, uploadUrl, accessToken, 0, MAX_RECOVERS_NUM, function (err, result) {
      if (err) {
        console.error('upload file to google error: ', err);
        return callback(err, null);
      }
      callback(null, result);
    });
  });
}


module.exports = {
  insertFile: insertFile,
};