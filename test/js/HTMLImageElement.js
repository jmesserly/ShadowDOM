/*
 * Copyright 2013 The Polymer Authors. All rights reserved.
 * Use of this source code is goverened by a BSD-style
 * license that can be found in the LICENSE file.
 */

suite('HTMLImageElement', function() {

  var iconUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHklEQVQ4T2Nk+A+EFADGUQMYRsOAYTQMgHloGKQDAJXkH/HZpKBrAAAAAElFTkSuQmCC';

  test('instanceof', function() {
    var img = document.createElement('img');
    assert.instanceOf(img, HTMLImageElement);
    assert.instanceOf(img, Image);
    assert.instanceOf(img, HTMLElement);
  });

  test('Image', function() {
    var img = new Image();
    assert.instanceOf(img, HTMLImageElement);
    assert.instanceOf(img, Image);
    assert.instanceOf(img, HTMLElement);
  });

  test('Image arguments', function() {
    var img = new Image(32);
    assert.equal(img.width, 32);
    assert.equal(img.height, 0);

    // Note: if Firefox, undefined is the first argument, both are treated as
    // undefined. So we use null here instead.
    var img = new Image(null, 32);
    assert.equal(img.width, 0);
    assert.equal(img.height, 32);
  });

  test('Image called as function', function() {
    if (!isIE())
      assert.throws(Image, TypeError);
  });

  test('Image basics', function() {
    var img = new Image();
    assert.equal('img', img.localName);

    var div = document.createElement('div');
    div.appendChild(img);

    assert.equal(div.firstChild, img);
    assert.equal('<div><img></div>', div.outerHTML);

    assert.equal(img.width, 0);
    assert.equal(img.height, 0);
  });

  test('Image load', function(done) {
    var img = new Image();
    img.addEventListener('load', function() {
      done();
    });
    img.src = iconUrl;
  });

});
