/**
 * Copyright 2012 The Polymer Authors. All rights reserved.
 * Use of this source code is goverened by a BSD-style
 * license that can be found in the LICENSE file.
 */

(function(scope) {
  'use strict';

  var EventTarget = scope.wrappers.EventTarget;
  var NodeList = scope.wrappers.NodeList;
  var assert = scope.assert;
  var clearObserverRegistrations = scope.clearObserverRegistrations;
  var copyProperty = scope.copyProperty;
  var enqueueMutation = scope.enqueueMutation;
  var mixin = scope.mixin;
  var registerTransientObservers = scope.registerTransientObservers;
  var wrappers = scope.wrappers;

  var emptyNodeList = new NodeList();

  function createOneElementNodeList(node) {
    var nodes = new NodeList();
    nodes[0] = node;
    nodes.length = 1;
    return nodes;
  }

  var surpressMutations = false;

  /**
   * Called before node is inserted into a node to enqueue its removal from its
   * old parent.
   * @param {!Node} node The node that is about to be removed.
   * @param {!Node} parent The parent node that the node is being removed from.
   * @param {!NodeList} nodes The collected nodes.
   */
  function enqueueRemovalForInsertedNodes(node, parent, nodes) {
    enqueueMutation(parent, 'childList', {
      removedNodes: nodes,
      previousSibling: node.previousSibling,
      nextSibling: node.nextSibling
    });
  }

  function enqueueRemovalForInsertedDocumentFragment(df, nodes) {
    enqueueMutation(df, 'childList', {
      removedNodes: nodes
    });
  }

  /**
   * Collects nodes from a DocumentFragment or a Node for removal followed
   * by an insertion.
   *
   * This updates the internal pointers for node, previousNode and nextNode.
   */
  function collectNodes(node, parentNode, previousNode, nextNode) {
    if (node instanceof DocumentFragment) {
      var nodes = collectNodesForDocumentFragment(node);

      // The extra loop is to work around bugs with DocumentFragments in IE.
      surpressMutations = true;
      for (var i = nodes.length - 1; i >= 0; i--) {
        node.removeChild(nodes[i]);
        nodes[i].parentNode_ = parentNode;
      }
      surpressMutations = false;

      for (var i = 0; i < nodes.length; i++) {
        nodes[i].previousSibling_ = nodes[i - 1] || previousNode;
        nodes[i].nextSibling_ = nodes[i + 1] || nextNode;
      }

      if (previousNode)
        previousNode.nextSibling_ = nodes[0];
      if (nextNode)
        nextNode.previousSibling_ = nodes[nodes.length - 1];

      return nodes;
    }

    var nodes = createOneElementNodeList(node);
    var oldParent = node.parentNode;
    if (oldParent) {
      // This will enqueue the mutation record for the removal as needed.
      oldParent.removeChild(node);
    }

    node.parentNode_ = parentNode;
    node.previousSibling_ = previousNode;
    node.nextSibling_ = nextNode;
    if (previousNode)
      previousNode.nextSibling_ = node;
    if (nextNode)
      nextNode.previousSibling_ = node;

    return nodes;
  }

  function collectNodesNative(node) {
    if (node instanceof DocumentFragment)
      return collectNodesForDocumentFragment(node);

    var nodes = createOneElementNodeList(node);
    var oldParent = node.parentNode;
    if (oldParent)
      enqueueRemovalForInsertedNodes(node, oldParent, nodes);
    return nodes;
  }

  function collectNodesForDocumentFragment(node) {
    var nodes = new NodeList();
    var i = 0;
    for (var child = node.firstChild; child; child = child.nextSibling) {
      nodes[i++] = child;
    }
    nodes.length = i;
    enqueueRemovalForInsertedDocumentFragment(node, nodes);
    return nodes;
  }

  function snapshotNodeList(nodeList) {
    // NodeLists are not live at the moment so just return the same object.
    return nodeList;
  }

  // http://dom.spec.whatwg.org/#node-is-removed
  function nodeWasRemoved(node) {
    clearObserverRegistrations(node);
    if (node.ownerShadowRoot_) node.ownerShadowRoot_ = null;
    for (var c = node.firstChild; c; c = c.nextSibling) {
      nodeWasRemoved(c);
    }
  }

  function nodesWereRemoved(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      nodeWasRemoved(nodes[i]);
    }
  }

  function ensureSameOwnerDocument(parent, child) {
    var ownerDoc = parent.nodeType === Node.DOCUMENT_NODE ?
        parent : parent.ownerDocument;
    if (ownerDoc !== child.ownerDocument)
      ownerDoc.adoptNode(child);
  }

  function adoptNodesIfNeeded(owner, nodes) {
    if (!nodes.length)
      return;

    var ownerDoc = owner.ownerDocument;

    // All nodes have the same ownerDocument when we get here.
    if (ownerDoc === nodes[0].ownerDocument)
      return;

    for (var i = 0; i < nodes.length; i++) {
      scope.adoptNodeNoRemove(nodes[i], ownerDoc);
    }
  }

  function prepareNodesForInsertion(owner, nodes) {
    adoptNodesIfNeeded(owner, nodes);
    var length = nodes.length;

    if (length === 1)
      return nodes[0];

    var df = owner.ownerDocument.createDocumentFragment();
    for (var i = 0; i < length; i++) {
      df.visualAppendChild_(nodes[i]);
    }
    return df;
  }


  function clearChildNodes(node) {
    var child = node.firstChild_;
    while (child) {
      var tmp = child;
      child = child.nextSibling_;
      tmp.parentNode_ = tmp.previousSibling_ = tmp.nextSibling_ = undefined;
    }
    node.firstChild_ = node.lastChild_ = undefined;
  }

  function removeAllChildNodes(node) {
    var child = node.firstChild;
    while (child) {
      assert(child.parentNode === node);
      var nextSibling = child.nextSibling;
      var parentNode = child.visualParentNode_;
      if (parentNode)
        parentNode.visualRemoveChild_(child);
      child.previousSibling_ = child.nextSibling_ = child.parentNode_ = null;
      child = nextSibling;
    }
    node.firstChild_ = node.lastChild_ = null;
  }

  function invalidateParent(node) {
    var p = node.parentNode;
    return p && p.invalidateShadowRenderer_();
  }

  function cleanupNodes(nodes) {
    for (var i = 0, n; i < nodes.length; i++) {
      n = nodes[i];
      n.parentNode.removeChild(n);
    }
  }

  var originalImportNode = document.importNode;
  var originalCloneNode = window.Node.prototype.cloneNode;

  function cloneNode(node, deep, opt_doc) {
    var clone;
    if (opt_doc)
      clone = originalImportNode.call(opt_doc, node, false);
    else
      clone = originalCloneNode.call(node, false);

    if (deep) {
      for (var child = node.firstChild; child; child = child.nextSibling) {
        clone.appendChild(cloneNode(child, true, opt_doc));
      }

      if (node.localName == 'template') {
        var cloneContent = clone.content;
        for (var child = node.content.firstChild;
             child;
             child = child.nextSibling) {
         cloneContent.appendChild(cloneNode(child, true, opt_doc));
        }
      }
    }
    // TODO(arv): Some HTML elements also clone other data like value.
    return clone;
  }

  function contains(self, child) {
    if (!child || self.ownerShadowRoot_ !== child.ownerShadowRoot_)
      return false;

    for (var node = child; node; node = node.parentNode) {
      if (node === self)
        return true;
    }
    return false;
  }

  var Node = window.Node;
  var DocumentFragment = window.DocumentFragment;
  var originalAppendChild = Node.prototype.appendChild;
  var originalCompareDocumentPosition =
      Node.prototype.compareDocumentPosition;
  var originalInsertBefore = Node.prototype.insertBefore;
  var originalRemoveChild = Node.prototype.removeChild;
  var originalReplaceChild = Node.prototype.replaceChild;

  var isIe = /Trident/.test(navigator.userAgent);

  var removeChildOriginalHelper = isIe ?
      function(parent, child) {
        try {
          originalRemoveChild.call(parent, child);
        } catch (ex) {
          if (!(parent instanceof DocumentFragment))
            throw ex;
        }
      } :
      function(parent, child) {
        originalRemoveChild.call(parent, child);
      };

  copyProperty(Node, 'parentNode', 'visualParentNode_');
  copyProperty(Node, 'firstChild', 'visualFirstChild_');
  copyProperty(Node, 'lastChild', 'visualLastChild_');
  copyProperty(Node, 'nextSibling', 'visualNextSibling_');
  copyProperty(Node, 'previousSibling', 'visualPreviousSibling_');
  copyProperty(Node, 'textContent', 'visualTextContent_');

  mixin(Node.prototype, {
    visualInsertBefore_: originalInsertBefore,
    visualAppendChild_: originalAppendChild,
    visualReplaceChild_: originalReplaceChild,
    visualRemoveChild_: originalRemoveChild, 
    
    /** @type {Node} */
    get parentNode() {
      // If the parentNode has not been overridden, use the original parentNode.
      return this.parentNode_ !== undefined ?
          this.parentNode_ : this.visualParentNode_;
    },

    /** @type {Node} */
    get firstChild() {
      return this.firstChild_ !== undefined ?
          this.firstChild_ : this.visualFirstChild_;
    },

    /** @type {Node} */
    get lastChild() {
      return this.lastChild_ !== undefined ?
          this.lastChild_ : this.visualLastChild_;
    },

    /** @type {Node} */
    get nextSibling() {
      return this.nextSibling_ !== undefined ?
          this.nextSibling_ : this.visualNextSibling_;
    },

    /** @type {Node} */
    get previousSibling() {
      return this.previousSibling_ !== undefined ?
          this.previousSibling_ : this.visualPreviousSibling_;
    },

    get childNodes() {
      var first = this.firstChild;
      if (!first) return emptyNodeList;

      var list = new NodeList();
      var i = 0;
      for (var child = first; child; child = child.nextSibling) {
        list[i++] = child;
      }
      list.length = i;
      return list;
    },

    hasChildNodes: function() {
      return this.firstChild !== null;
    },

    get parentElement() {
      var p = this.parentNode;
      while (p && p.nodeType !== Node.ELEMENT_NODE) {
        p = p.parentNode;
      }
      return p;
    },

    get textContent() {
      // TODO(arv): This should fallback to this.visualTextContent_ if there
      // are no shadow trees below or above the context node.
      var s = '';
      for (var child = this.firstChild; child; child = child.nextSibling) {
        if (child.nodeType != Node.COMMENT_NODE) {
          s += child.textContent;
        }
      }
      return s;
    },

    set textContent(textContent) {
      var removedNodes = snapshotNodeList(this.childNodes);

      if (this.invalidateShadowRenderer_()) {
        removeAllChildNodes(this);
        if (textContent !== '') {
          this.appendChild(this.ownerDocument.createTextNode(textContent));
        }
      } else {
        if (this.firstChild_ !== undefined)
          clearChildNodes(this);
        this.visualTextContent_ = textContent;
      }

      var addedNodes = snapshotNodeList(this.childNodes);

      enqueueMutation(this, 'childList', {
        addedNodes: addedNodes,
        removedNodes: removedNodes
      });

      nodesWereRemoved(removedNodes);
      var root = this.ownerShadowRoot_;
      if (root) root.nodesWereAdded_(addedNodes);
    },

    cloneNode: function(deep) {
      return cloneNode(this, deep);
    },

    contains: function(child) {
      return contains(this, child);
    },

    appendChild: function(child) {
      return this.insertBefore(child, null);
    },

    insertBefore: function(child, refNode) {
      refNode && assert(refNode.parentNode === this);

      var nodes;
      var previousNode =
          refNode ? refNode.previousSibling : this.lastChild;

      var useNative = !this.invalidateShadowRenderer_() &&
                      !invalidateParent(child);

      if (useNative) {
        nodes = collectNodesNative(child);
        ensureSameOwnerDocument(this, child);
        if (this.firstChild_ !== undefined)
          clearChildNodes(this);
        this.visualInsertBefore_(child, refNode);
      } else {
        nodes = collectNodes(child, this, previousNode, refNode);
        if (!previousNode)
          this.firstChild_ = nodes[0];
        if (!refNode) {
          this.lastChild_ = nodes[nodes.length - 1];
          if (this.firstChild_ === undefined)
            this.firstChild_ = this.firstChild;
        }

        var parentNode = refNode ? refNode.visualParentNode_ : this;

        // insertBefore refNode no matter what the parent is?
        if (parentNode) {
          parentNode.visualInsertBefore_(
              prepareNodesForInsertion(this, nodes), refNode);
        } else {
          adoptNodesIfNeeded(this, nodes);
        }
      }

      enqueueMutation(this, 'childList', {
        addedNodes: nodes,
        nextSibling: refNode,
        previousSibling: previousNode
      });

      var root = this.ownerShadowRoot_;
      if (root) root.nodesWereAdded_(nodes);

      return child;
    },

    removeChild: function(child) {
      if (child.parentNode !== this) {
        // IE has invalid DOM trees at times.
        var found = false;
        var childNodes = this.childNodes;
        for (var ieChild = this.firstChild; ieChild;
             ieChild = ieChild.nextSibling) {
          if (ieChild === child) {
            found = true;
            break;
          }
        }
        if (!found) {
          // TODO(arv): DOMException
          throw new Error('NotFoundError');
        }
      }

      var childNextSibling = child.nextSibling;
      var childPreviousSibling = child.previousSibling;

      if (this.invalidateShadowRenderer_()) {
        // We need to remove the real node from the DOM before updating the
        // pointers. This is so that that mutation event is dispatched before
        // the pointers have changed.
        var thisFirstChild = this.firstChild;
        var thisLastChild = this.lastChild;

        var parentNode = child.visualParentNode_;
        if (parentNode)
          removeChildOriginalHelper(parentNode, child);

        if (thisFirstChild === child)
          this.firstChild_ = childNextSibling;
        if (thisLastChild === child)
          this.lastChild_ = childPreviousSibling;
        if (childPreviousSibling)
          childPreviousSibling.nextSibling_ = childNextSibling;
        if (childNextSibling) {
          childNextSibling.previousSibling_ =
              childPreviousSibling;
        }

        child.previousSibling_ = child.nextSibling_ =
            child.parentNode_ = undefined;
      } else {
        if (this.firstChild_ !== undefined)
          clearChildNodes(this);
        removeChildOriginalHelper(this, child);
      }

      if (!surpressMutations) {
        enqueueMutation(this, 'childList', {
          removedNodes: createOneElementNodeList(child),
          nextSibling: childNextSibling,
          previousSibling: childPreviousSibling
        });
      }

      registerTransientObservers(this, child);

      nodeWasRemoved(child);

      return child;
    },

    replaceChild: function(newChild, oldChild) {
      if (oldChild.parentNode !== this) {
        // TODO(arv): DOMException
        throw new Error('NotFoundError');
      }

      var nextNode = oldChild.nextSibling;
      var previousNode = oldChild.previousSibling;
      var nodes;

      var useNative = !this.invalidateShadowRenderer_() &&
                      !invalidateParent(newChild);

      if (useNative) {
        nodes = collectNodesNative(newChild);
      } else {
        if (nextNode === newChild)
          nextNode = newChild.nextSibling;
        nodes = collectNodes(newChild, this, previousNode, nextNode);
      }

      if (!useNative) {
        if (this.firstChild === oldChild)
          this.firstChild_ = nodes[0];
        if (this.lastChild === oldChild)
          this.lastChild_ = nodes[nodes.length - 1];

        oldChild.previousSibling_ = oldChild.nextSibling_ =
            oldChild.parentNode_ = undefined;

        // replaceChild no matter what the parent is?
        if (oldChild.visualParentNode_) {
          oldChild.visualParentNode_.visualReplaceChild_(
              prepareNodesForInsertion(this, nodes),
              oldChild);
        }
      } else {
        ensureSameOwnerDocument(this, newChild);
        if (this.firstChild_ !== undefined)
          clearChildNodes(this);
        this.visualReplaceChild_(newChild, oldChild);
      }

      enqueueMutation(this, 'childList', {
        addedNodes: nodes,
        removedNodes: createOneElementNodeList(oldChild),
        nextSibling: nextNode,
        previousSibling: previousNode
      });

      nodeWasRemoved(oldChild);
      var root = this.ownerShadowRoot_;
      if (root) root.nodeWasAdded_(newChild);

      return oldChild;
    },

    normalize: function() {
      var nodes = snapshotNodeList(this.childNodes);
      var remNodes = [];
      var s = '';
      var modNode;

      for (var i = 0, n; i < nodes.length; i++) {
        n = nodes[i];
        if (n.nodeType === Node.TEXT_NODE) {
          if (!modNode && !n.data.length)
            this.removeNode(n);
          else if (!modNode)
            modNode = n;
          else {
            s += n.data;
            remNodes.push(n);
          }
        } else {
          if (modNode && remNodes.length) {
            modNode.data += s;
            cleanupNodes(remNodes);
          }
          remNodes = [];
          s = '';
          modNode = null;
          if (n.childNodes.length)
            n.normalize();
        }
      }

      // handle case where >1 text nodes are the last children
      if (modNode && remNodes.length) {
        modNode.data += s;
        cleanupNodes(remNodes);
      }
    },

  });

  scope.cloneNode = cloneNode;
  scope.nodesWereRemoved = nodesWereRemoved;
  scope.snapshotNodeList = snapshotNodeList;
  scope.copyProperty = copyProperty;
  scope.Node = Node;

})(window.ShadowDOMPolyfill);
