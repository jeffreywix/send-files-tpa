'use strict';

// var handleError = function (client, done, err) {
//     // no error occurred, continue with the request
//     if (!err) { return false; }

//     done(client);
//     console.error('query error: ', err);
//     return true;
// };

function calcTokenExpiresDate(expiresIn) {
  var date = new Date();
  return new Date(date.getTime() + (expiresIn - 60) * 1000);
}

function isAccessTokenExpired(token) {
  var expiresOn = +new Date(token.expires);
  var now = +new Date();
  return expiresOn > now;
}

function insertToken(client, instance, tokens, provider, callback) {
  var query = 'INSERT INTO oauth_token (instance_id, component_id, access_token, refresh_token, token_type, expires, auth_provider, created) \
               VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())';
  var values = [
    instance.instanceId,
    instance.componentId,
    tokens.access_token,
    tokens.refresh_token,
    tokens.token_type,
    calcTokenExpiresDate(tokens.expires_in),
    provider
  ];

  client.query(query, values, function (err, result) {
    if (err) { console.error('tokens insert error: ', err); }

    callback(result);
  });
}

function getToken(client, instance, provider, callback) {
  var query = 'SELECT access_token, refresh_token, expires, auth_provider \
               FROM oauth_token \
               WHERE instance_id = $1 \
               AND component_id = $2 \
               AND auth_provider = $3 \
               LIMIT 1';
  var values = [
    instance.instanceId,
    instance.componentId,
    provider
  ];

  client.query(query, values, function (err, result) {
    if (err) { console.error('get token error: ', err); }
    callback(result.rows[0]);
  });
}


function updateToken(client, instance, tokens, provider, callback) {

  var query = 'UPDATE oauth_token \
               SET access_token =  $1, expires = $2 \
               WHERE instance_id = $3 \
               AND component_id = $4 \
               AND auth_provider = $5 \
               RETURNING *';
  var values = [
    tokens.access_token,
    calcTokenExpiresDate(tokens.expires_in),
    instance.instanceId,
    instance.componentId,
    provider
  ];

  client.query(query, values, function (err, result) {
    if (err) { console.error('token update error: ', err); }

    callback(result.rows[0]);
  });
}

function deleteToken(client, instance, provider, callback) {
  var query = 'DELETE FROM oauth_token \
               WHERE instance_id = $1 \
               AND component_id = $2 \
               AND auth_provider = $3 \
               RETURNING *';
  var values = [
    instance.instanceId,
    instance.componentId,
    provider
  ];

  client.query(query, values, function (err, result) {
    if (err) { console.error('delete token error: ', err); }
    if (err) {
      callback(undefined);
    } else {
      callback(result.rows[0]);
    }
  });
}

function insertWidgetEmail(client, instance, email, callback) {
  var query = 'INSERT INTO widget_settings (instance_id, component_id, user_email, updated, created) \
               VALUES ($1, $2, $3, NOW(), NOW())';
  var values = [
    instance.instanceId,
    instance.componentId,
    email
  ];
  client.query(query, values, function (err, result) {
    if (err) { console.error('email insert error: ', err); }

    callback(result);
  });
}

module.exports = {
  getToken: getToken,
  insertToken: insertToken,
  updateToken: updateToken,
  deleteToken: deleteToken,
  insertWidgetEmail: insertWidgetEmail,
  isAccessTokenExpired: isAccessTokenExpired
};
