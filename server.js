var _ = require('lodash');
var argv = require('minimist')(process.argv.slice(2));
var http = require('http');
var socketCluster = require('socketcluster-server');

var RETRY_DELAY = 2000;
var DEFAULT_PORT = 7777;

var port = Number(argv.p) || DEFAULT_PORT;
var httpServer = http.createServer();
var scServer = socketCluster.attach(httpServer);

var serverInstances = {};
var clientInstances = {};

var getServerClusterState = function () {
  return {
    serverInstances: serverInstances,
    time: Date.now()
  };
};

var serverLeaveCluster = function (socket, respond) {
  delete serverInstances[socket.instanceId];
  sendEventToAllInstances(clientInstances, 'serverLeaveCluster', getServerClusterState());
  respond && respond();
};

var clientLeaveCluster = function (socket, respond) {
  delete clientInstances[socket.instanceId];
  respond && respond();
};

var checkClientStatesConvergence = function (socketList) {
  var prevInstanceState = null;
  var allStatesEqual = true;
  _.forEach(socketList, function (socket) {
    if (prevInstanceState && prevInstanceState != socket.instanceState) {
      allStatesEqual = false;
      return;
    }
    prevInstanceState = socket.instanceState;
  });
  return allStatesEqual;
};

var sendEventToInstance = function (socket, event, data) {
  socket.emit(event, data, function (err) {
    if (err && socket.state == 'open') {
      setTimeout(sendEventToInstance.bind(null, socket, event, data), RETRY_DELAY);
    }
  });
};

var sendEventToAllInstances = function (instances, event, data) {
  _.forEach(instances, function (socket) {
    sendEventToInstance(socket, event, data);
  });
};

scServer.on('connection', function (socket) {
  socket.on('serverJoinCluster', function (data, respond) {
    socket.instanceType = 'server';
    socket.instanceId = data.instanceId;
    serverInstances[data.instanceId] = socket;
    sendEventToAllInstances(clientInstances, 'serverJoinCluster', getServerClusterState());
    respond();
  });
  socket.on('serverLeaveCluster', function (respond) {
    serverLeaveCluster(socket, respond);
  });
  socket.on('clientJoinCluster', function (data, respond) {
    socket.instanceType = 'client';
    socket.instanceId = data.instanceId;
    clientInstances[data.instanceId] = socket;
    respond(null, getServerClusterState());
  });
  socket.on('clientLeaveCluster', function (respond) {
    clientLeaveCluster(socket, respond);
  });
  socket.on('clientSetState', function (data, respond) {
    socket.instanceState = data.instanceState;
    var clientStatesConverge = checkClientStatesConvergence(clientInstances);
    if (clientStatesConverge) {
      sendEventToAllInstances(clientInstances, 'clientStatesConverge', {state: socket.instanceState});
    }
    respond();
  });
  socket.on('disconnect', function () {
    if (socket.instanceType == 'server') {
      serverLeaveCluster(socket);
    } else if (socket.instanceType == 'client') {
      clientLeaveCluster(socket);
    }
  });
});

httpServer.listen(port);