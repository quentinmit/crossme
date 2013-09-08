Deps.autorun(function () {
  Meteor.subscribe('puzzles');
  var id = Session.get('gameid');
  if (id)
    Meteor.subscribe('game', id);
  var puz = Session.get('previewid');
  if (puz)
    Meteor.subscribe('puzzle', puz);
});
Deps.autorun(function () {
  if (Session.get('gameid') && puzzle_id()) {
    var s = selected_square();
    if (!s || s.black) {
      s = find(active_puzzle(), 0, 0, 0, 1, function (s) { return !s.black });
      select(s);
    } else {
      Session.set('word-across', s.word_across);
      Session.set('word-down', s.word_down);
    }
  }
});

window.active_puzzle = function() {
  var id = puzzle_id();
  return id && Puzzles.findOne({_id: id});
}

function puzzle_id() {
  if (Session.get('previewid'))
    return Session.get('previewid');
  var id = Session.get('gameid');
  var game = id && Games.findOne({_id: id});
  return game && game.puzzle;
}

function selected_square() {
  return Squares.findOne({
                    puzzle: puzzle_id(),
                    row: Session.get('selected-row'),
                    column: Session.get('selected-column')
                  });
}

function selected_clue() {
  var s = selected_square();
  var dir = Session.get('selected-direction');
  return s && Clues.findOne({puzzle:s.puzzle,
                             direction: dir,
                             number: selected_square()['word_' + dir]});
}

function isPencil() {
  return Session.equals('pencil', true);
}

Template.puzzle.show = function() {
  return !!active_puzzle();
}
Template.puzzle.showControls = function() {
  return !!Session.get('gameid');
}

Template.puzzle.puzzle = active_puzzle;

Template.currentclue.clue = selected_clue;

Template.puzzle.rows = function() {
  var rows = [];
  var puz = active_puzzle();
  for (var r = 0; r < puz.height; r++) {
    rows.push({puzzle: puz, row: r});
  }
  return rows;
}

Template.metadata.preview = function() {
  return !!Session.get('previewid');
}

Template.metadata.events({
  'click button': function() {
    var puz = Session.get('previewid');
    Meteor.call('newGame', puz, function (error, id) {
      if (!error)
        load_game(id);
    });
    return false;
  }
});

function scroll_into_view(e) {
  if (e.length) {
    var r = e[0].getClientRects()[0];
    if (document.elementFromPoint(r.left, r.top) !== e[0] ||
        document.elementFromPoint(r.right, r.bottom) !== e[0])
      e[0].scrollIntoView();
  }
}

function select(square) {
  Session.set('selected-row', square.row);
  Session.set('selected-column', square.column);
  Session.set('word-across', square.word_across);
  Session.set('word-down', square.word_down);
  Session.set('check-ok', null);
  if (!Session.get('selected-direction'))
    Session.set('selected-direction', 'across');
  scroll_into_view($('#clues .across .clue.clue-'+ square.word_across));
  scroll_into_view($('#clues .down .clue.clue-' + square.word_down));
  return false;
}

function find(puz, row, col, dr, dc, predicate) {
  var s;
  while (true) {
    if (row < 0 || row >= puz.height ||
        col < 0 || col >= puz.width)
      return null;
    s = Squares.findOne({row: row, column: col, puzzle: puz._id});
    if (predicate(s))
      return s;
    row += dr;
    col += dc;
  }
}

function move(dr, dc, inword) {
  Session.set('selected-direction', dr ? 'down' : 'across');

  var row = Session.get('selected-row') || 0,
      col = Session.get('selected-column') || 0;
  var puz = active_puzzle();
  var sel = selected_square();
  var dst = find(puz, row+dr, col+dc, dr, dc, function (s) {
    if (inword && ((dc && sel.word_across !== s.word_across) ||
                   (dr && sel.word_down   !== s.word_down)))
      return false;
    return !s.black;
  });
  if (!dst) return false;
  select(dst);
  return false;
}

function letter(keycode) {
  var s = String.fromCharCode(keycode);
  var square = selected_square();
  Meteor.call('setLetter', Session.get('gameid'), square._id, s, isPencil());
  if (Session.get('selected-direction') == 'across')
    move(0, 1, true);
  else
    move(1, 0, true);
  return false;
}

function clearCell() {
  var square = selected_square();
  Meteor.call('clearLetter', Session.get('gameid'), square._id);
  Session.set('check-ok', null);
  return false;
}

function deleteKey() {
  clearCell();
  if (Session.get('selected-direction') == 'across')
    move(0, -1, true);
  else
    move(-1, 0, true);
  return false;
}

function find_blank_in_word(square, dr, dc) {
  return find(Puzzles.findOne(square.puzzle),
              square.row, square.column, dr, dc, function (s) {
    if (s.black ||
        (dc && (square.word_across !== s.word_across)) ||
        (dr && (square.word_down !== s.word_down)))
      return false;
    var f = Fills.findOne({square: s._id, game: Session.get('gameid')});
    return f && f.letter === null;
  });
}

function tabKey(k) {
  var dr = 0, dc = 0;
  if (Session.get('selected-direction') === 'down')
    dr = 1;
  else
    dc = 1;
  var sel = selected_clue();
  var cmp, sort;
  if (k.shiftKey) {
    cmp = '$lt';
    sort = -1;
  } else {
    cmp = '$gt';
    sort = 1;
  }
  var query = {};
  query[cmp] = sel.number;
  var clue = Clues.findOne({number: query, puzzle: sel.puzzle, direction: sel.direction},
                         {sort: {number: sort}});
  if (!clue)
    clue = Clues.findOne({puzzle: sel.puzzle, direction: sel.direction},
                           {sort: {number: sort}});
  var h = {puzzle: clue.puzzle};
  h['word_' + clue.direction] = clue.number;
  var s = Squares.findOne(h);
  s = find_blank_in_word(s, dr, dc) || s;
  select(s);
  return false;
}

function handle_key(k) {
  if (k.altKey || k.ctrlKey)
    return true;
  if (k.keyCode === 39)
    return move(0, 1);
  else if (k.keyCode === 37)
    return move(0, -1);
  else if (k.keyCode === 38)
    return move(-1, 0);
  else if(k.keyCode === 40)
    return move(1, 0);
  if (!Session.get('gameid'))
    return true;
  else if (k.keyCode >= 'A'.charCodeAt(0) && k.keyCode <= 'Z'.charCodeAt(0))
    return letter(k.keyCode);
  else if (k.keyCode === ' '.charCodeAt(0))
    return clearCell();
  else if (k.keyCode === 8 ||
           k.keyCode === 46)
    return deleteKey();
  else if (k.keyCode === 9)
    return tabKey(k);
  return true;
}

Template.row.cells = function() {
  return Squares.find({puzzle: this.puzzle._id, row: this.row},{sort: {column: 1}}).fetch();
}

Template.cell.number = function() {
  return this.number;
}

Template.cell.fill = function() {
  if (!Session.get('gameid'))
    return '';
  var f = Fills.findOne({square: this._id, game: Session.get('gameid')});
  return f ? (f.letter || '') : '';
}

Template.cell.events({
  'click': function () {
    if (!this.black)
      select(this);
  }
});

Template.cell.css_class = function() {
  var classes = []
  if (this.black)
    return 'filled';
  if (Session.equals('selected-row', this.row) &&
           Session.equals('selected-column', this.column))
    classes.push('selected');
  else if (Session.equals('word-across', this.word_across))
    classes.push(Session.equals('selected-direction', 'across') ? 'inword' : 'otherword');
  else if (Session.equals('word-down', this.word_down))
    classes.push(Session.equals('selected-direction', 'down') ? 'inword' : 'otherword');
  if (Session.get('gameid')) {
    var fill = Fills.findOne({square: this._id, game: Session.get('gameid')});
    if (fill && fill.reveal)
      classes.push('reveal');
    else if (fill && fill.checked === 'checking')
    classes = classes.concat(['checked', 'wrong']);
    else if (fill && fill.checked === 'checked')
    classes.push('checked');
    if (fill && fill.pencil)
      classes.push('pencil');
  }
  return classes.join(' ');
}

Template.clues.across_clues = function() {
  return Clues.find({puzzle: puzzle_id(), direction: 'across'}, {sort: {number: 1}});
}

Template.clues.down_clues = function() {
  return Clues.find({puzzle: puzzle_id(), direction: 'down'}, {sort: {number: 1}});
}

Template.clue.number = function() {
  return this.number;
}

Template.clue.text = function() {
  return this.text;
}

Template.clue.events({
  'click': function() {
    var s = Squares.findOne({puzzle: this.puzzle, number: this.number});
    Session.set('selected-direction', this.direction);
    select(s);
  }
})

Template.clue.css_class = function() {
  var classes = ['clue-' + this.number];
  if (Session.equals('word-' + this.direction, this.number)) {
    if (Session.equals('selected-direction', this.direction))
      classes.push('selected');
    else
      classes.push('otherword');
  }
  return classes.join(' ');
}

window.load_game = function(id) {
  Meteor.Router.to('game', id);
}

window.load_preview = function(id) {
  Meteor.Router.to('preview', id);
}

function puzzleState() {
  return {
    game: Session.get('gameid'),
    square: selected_square()._id,
    direction: Session.get('selected-direction')
  };
}

Template.controls.events({
  'click #mReveal a': function(e) {
    var target = $(e.currentTarget).data('target');
    Meteor.call('reveal', puzzleState(), target);
    return true;
  },
  'click #mCheck a': function(e) {
    var target = $(e.currentTarget).data('target');
    Meteor.call('check', puzzleState(), target, function (error, square) {
      if (error === undefined) {
        if (square) {
          select(Squares.findOne({_id: square}));
          Session.set('check-ok', false);
        } else {
          Session.set('check-ok', true);
        }
      }
    });
    return true;
  },
  'click .implement button': function(e) {
    Session.set('pencil', $(e.currentTarget).data('pencil'))
  }
});

Template.controls.check_class = function() {
  if (Session.get('check-ok'))
    return 'check-ok';
  return '';
}

Template.controls.penclass = function() {
  if (isPencil()) {
    return ""
  } else {
    return "active";
  }
}

Template.controls.pencilclass = function() {
  if (isPencil()) {
    return "active"
  } else {
    return "";
  }
}

Template.controls.players = function() {
  var id = Session.get('gameid');
  var game = id && Games.findOne({_id: id});
  if (!game || !game.players) {
    return [];
  }
  return game.players.map(function (who) {
    who.user = Meteor.users.findOne({_id: who.userId});
    return who;
  });
}

function maybePing() {
  if (Meteor.userId() && Session.get('gameid')) {
    Meteor.call('ping', Session.get('gameid'));
  }
}

Meteor.startup(function() {
  $('body').on('keydown', handle_key);
  Meteor.setInterval(maybePing, 30 * 1000);
});

Deps.autorun(maybePing);
