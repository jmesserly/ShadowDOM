/*
 * Copyright 2014 The Polymer Authors. All rights reserved.
 * Use of this source code is goverened by a BSD-style
 * license that can be found in the LICENSE file.
 */

(function(scope) {
  'use strict';

  var UIEvent = scope.wrappers.UIEvent;
  var mixin = scope.mixin;
  
  // TouchEvent is WebKit/Blink only.
  var OriginalTouchEvent = window.TouchEvent;
  if (!OriginalTouchEvent)
    return;

  var nativeEvent;
  try {
    nativeEvent = document.createEvent('TouchEvent');
  } catch (ex) {
    // In Chrome creating a TouchEvent fails if the feature is not turned on
    // which it isn't on desktop Chrome.
    return;
  }

  var nonEnumDescriptor = {enumerable: false};

  function nonEnum(obj, prop) {
    Object.defineProperty(obj, prop, nonEnumDescriptor);
  }

  function Touch(impl) {
    this.impl = impl;
  }

  Touch.prototype = {
    get target() {
      return this.impl.target;
    }
  };

  var descr = {
    configurable: true,
    enumerable: true,
    get: null
  };

  [
    'clientX',
    'clientY',
    'screenX',
    'screenY',
    'pageX',
    'pageY',
    'identifier',
    'webkitRadiusX',
    'webkitRadiusY',
    'webkitRotationAngle',
    'webkitForce'
  ].forEach(function(name) {
    descr.get = function() {
      return this.impl[name];
    };
    Object.defineProperty(Touch.prototype, name, descr);
  });

  function TouchList() {
    this.length = 0;
    nonEnum(this, 'length');
  }

  TouchList.prototype = {
    item: function(index) {
      return this[index];
    }
  };

  function wrapTouchList(nativeTouchList) {
    var list = new TouchList();
    for (var i = 0; i < nativeTouchList.length; i++) {
      list[i] = new Touch(nativeTouchList[i]);
    }
    list.length = i;
    return list;
  }

  function TouchEvent(impl) {
    UIEvent.call(this, impl);
  }

  TouchEvent.prototype = Object.create(UIEvent.prototype);

  mixin(TouchEvent.prototype, {
    get touches() {
      return wrapTouchList(this.touches);
    },

    get targetTouches() {
      return wrapTouchList(this.targetTouches);
    },

    get changedTouches() {
      return wrapTouchList(this.changedTouches);
    },

    initTouchEvent: function() {
      // The only way to use this is to reuse the TouchList from an existing
      // TouchEvent. Since this is WebKit/Blink proprietary API we will not
      // implement this until someone screams.
      throw new Error('Not implemented');
    }
  });

  scope.wrappers.Touch = Touch;
  scope.wrappers.TouchEvent = TouchEvent;
  scope.wrappers.TouchList = TouchList;

})(window.ShadowDOMPolyfill);

