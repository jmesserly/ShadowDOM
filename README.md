## Learn the tech

### Basic usage

    var el = document.createElement('div');
    var shadow = el.createShadowRoot();
    shadow.innerHTML = '<content select="q"></content>';
    document.body.appendChild(el);

### Shadow DOM subtrees

Shadow DOM allows a single node to express three subtrees: _light DOM_, _shadow DOM_, and _composed DOM_.

Together, the light DOM and shadow DOM are referred to as the _logical DOM_. This is the DOM that the developer interacts with. The composed DOM is what the browser sees and uses to render the pixels on the screen.

**Light DOM**

The user of your custom element supplies the light DOM:

    <my-custom-element>
      <q>Hello World</q> <!-- part of my-custom-element's light DOM -->
    </my-custom-element>

The light DOM of `<my-custom-element>` is visible to the end-user of the
element as a normal subtree. They can access `.childNodes`, `.children`, `.innerHTML`, or any other property or method that gives information about a node's subtree.

**Shadow DOM**

`<my-custom-element>` may define shadow DOM by attaching a shadow root to
itself.

    #document-fragment
      <!-- everything in here is my-custom-element's shadow DOM -->
      <span>People say: <content></content></span>
      <footer>sometimes</footer>

Shadow DOM is internal to the element and hidden from the end-user.
Its nodes are not children of `<my-custom-element>`.

**Note:** Shadow roots are represented as a `#document-fragment` in the DevTools.
{: .alert .alert-info }

**Composed (rendered) DOM**

The composed DOM is what the browser actually renders. For rendering, the light
DOM is distributed into the shadow DOM to produce the composed DOM. The final output
looks something like this:

    <my-custom-element>
      <span>People say: <q>Hello World</q></span>
      <footer>sometimes</footer>
    </my-custom-element>

Nodes in light DOM or shadow DOM express parent and sibling relationships that match their respective tree structures; the relationships that exist in the composed tree are not expressed anywhere in DOM. So, while the `<span>` in the final composed tree is a child of `<my-custom-element>` and the parent of `<q>`, it is actually a child of the shadow root and `<q>` is a child of `<my-custom-element>`. The two nodes are unrelated but
Shadow DOM renders them as if they are. In this way, the user can manipulate light DOM or shadow DOM directly as regular DOM subtrees, and let the system take care of keeping the render tree synchronized.

## Polyfill details

A polyfill to provide Shadow DOM functionality in browsers that don't
support it natively. This section explains how a proper (native) implementation
differs from our polyfill implementation.

### Wrapperless

The polyfill does not wrap objects, but it does patch methods and accessors.

For example the `innerHTML` setter works just like the native `innerHTML` but it instead of working on the composed tree it works on the local DOM. When you change the logical DOM tree like this it might cause the composed tree to need to be re-rendered. This does not happen immediately, but it is scheduled to happen later as needed.

The `firstChild` getter also works against the logical DOM.

#### More Logical DOM

Internally each Node has has the 5 fundamental Node pointers, `parentNode`, `firstChild`, `lastChild`, `nextSibling` and `previousSibling`. When the DOM tree is manipulated these pointers are updated to always represent the logical tree. When the shadow DOM renderer needs to render the visual tree, these internal pointers are updated as needed.

#### Event Retargetting

An important aspect of the shadow DOM is that events are retargetted to never expose the shadow DOM to the light DOM. For example.

    var div = document.createElement('div');
    div.innerHTML = 'Click me';
    var shadow = div.createShadowRoot();
    shadow.innerHTML = '<b><content></content></b>';

If the user clicks on the `div` the real `target` of the click event is the `<b>` element. But that element is not visible in the light DOM so the target is therefore retargetted to the `div` element itself. However, if there is an event listener on the `<content>`, `<b>` or the shadow root, the target should be visible to the event listener.

Similar issues occur with `relatedTarget` in `mouseover` and `mouseout` events.

To support this kind of behavior the event dispatching in the browser has to be reimplemented by the polyfill.

#### Known limitations

* CSS encapsulation is limited.
* No live `NodeList`s. All node lists are snapshotted upon read.
* CSS `:host()` rules can only have (at most) 1-level of nested parentheses in its argument selector. For example, `:host(.zot)` and `:host(.zot:not(.bar))` both work, but `:host(.zot:not(.bar:nth-child(2)))` does not.

#### Current browser support

* All tests passing in latest Firefox
* Core functionality works in IE 11, but there are test failures
* 95% tests passing in Safari 7. Note that Safari needs the dom-accessors.js
  transpiler and polyfill, because its DOM properties cannot be properly
  reconfigured.



