
/**
 * Module dependencies.
 */

var express = require('express');
var routes = require('./routes');
var path = require('path');
var Seed = require('seed');

var app = module.exports = express.createServer();// module.exports = express();

var port = 1404;
// all environments
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// Our psuedo database, on Seed.
// https://github.com/logicalparadox/seed

var NameSpace = {};

NameSpace.Player = Seed.Model.extend('player', {
  schema: new Seed.Schema({
    gameid: String,
    progress: Number,
    roomNumber: String
  })
});

NameSpace.Game = Seed.Graph.extend({
  initialize: function () {
    this.define(NameSpace.Player);
  }
});

var db = new NameSpace.Game()
  , guid = new Seed.ObjectId();

// Socket.io

var io = require('socket.io').listen(app);
var currentRoomNumber = 0;
var numberOfPlayersInTheRoom = 0;
/**
 * our socket transport events
 *
 * You will notice that when we emit the changes
 * in `create`, `update`, and `delete` we both
 * socket.emit and socket.broadcast.emit
 *
 * socket.emit sends the changes to the browser session
 * that made the request. not required in some scenarios
 * where you are only using ioSync for Socket.io
 *
 * socket.broadcast.emit sends the changes to
 * all other browser sessions. this keeps all
 * of the pages in mirror. our client-side model
 * and collection ioBinds will pick up these events
 */

io.sockets.on('connection', function (socket) {
  socket.joined = false;
  socket.join(String(currentRoomNumber));
  /**
   * todo:create
   *
   * called when we .save() our new todo
   *
   * we listen on model namespace, but emit
   * on the collection namespace
   */

  socket.on('player:create', function (data, callback) {
    var id = guid.gen();
    socket.joined = true;
    numberOfPlayersInTheRoom++;
    if(numberOfPlayersInTheRoom == 3){
      var socList = io.sockets.clients(String(currentRoomNumber))
      socList.forEach(function(soc){
        if(soc.joined == false){
          soc.leave(String(currentRoomNumber));
          soc.join(String(currentRoomNumber+1));  
        }
      });
      numberOfPlayersInTheRoom = 0;
    }
  
    data.roomNumber = String(currentRoomNumber);
    var player = db.set('/player/' + id, data)
      , json = player._attributes;
  
    socket.to(String(currentRoomNumber)).emit('game:create', json);
    socket.broadcast.to(String(currentRoomNumber)).emit('game:create', json);
    if(numberOfPlayersInTheRoom == 0){
      currentRoomNumber++;
      io.sockets.in(String(currentRoomNumber)).emit('game:empty');    
    }
    
    callback(null, json);
  });

  /**
   * todos:read
   *
   * called when we .fetch() our collection
   * in the client-side router
   */

  socket.on('game:read', function (data, callback) {
    socket.join(String(currentRoomNumber));
    var list = [];

    db.each('player', function (player) {
      if(player._attributes.roomNumber == currentRoomNumber){
          list.push(player._attributes);
      }
    });
    callback(null, list);
  });

  /**
   * todo:update
   *
   * called when we .save() our model
   * after toggling its completed status
   */

  socket.on('player:update', function (data, callback) {
    var player = db.get('/player/' + data.id);
    player.set(data);

    var playersRoomNumber = player._attributes.roomNumber;
    var json = player._attributes;
    var prog = player._attributes.progress;
    socket.to(playersRoomNumber).emit('player/' + data.id + ':update', json);
    socket.broadcast.to(playersRoomNumber).broadcast.emit('player/' + data.id + ':update', json);
    if(prog == 27){
      io.sockets.in(String(playersRoomNumber)).emit('game:empty'); 
    }
    callback(null, json);
  });

  /**
   * todo:delete
   *
   * called when we .destroy() our model
   */

  socket.on('player:delete', function (data, callback) {
    console.log(db.get('/player/' + data.id))
    var json = db.get('/player/' + data.id)._attributes;

    db.del('/player/' + data.id);

    socket.emit('player/' + data.id + ':delete', json);
    socket.broadcast.emit('player/' + data.id + ':delete', json);
    callback(null, json);
  });

});

app.all('*', function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "http://localhost");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");
  res.header("Access-Control-Allow-Credentials",true);
  next();
});

if (!module.parent) {
  app.listen(port);
  console.log("Backbone.ioBind Example App listening on port %d in %s mode", port, app.settings.env);
}
