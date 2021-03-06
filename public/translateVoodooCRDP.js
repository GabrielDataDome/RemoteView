import keys from './kbd.js';


export const FRAME_CONTROL = false;
export const IMAGE_FORMAT = 'png';
export const WorldName = 'PlanetZanj';

const SHORT_TIMEOUT = 1000;

const MIN_DELTA = 40;
const MIN_PIX_DELTA = 8;
const THRESHOLD_DELTA = 1;
const DOM_DELTA_PIXEL = 0;
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;
const LINE_HEIGHT_GUESS = 32;

const SYNTHETIC_CTRL = e => keyEvent({key:'Control',originalType:e.originalType}, 2, true);

export default translator;

function translator(e, handled = {type:'case'}) {
  handled.type = handled.type || 'case';
  switch(e.type) {
    case "touchcancel": {
      return {
        command : {
          name: "Input.dispatchTouchEvent",
          params: {
            type: "touchCancel"
          },
        }
      };
    }
    case "mousedown": case "mouseup": case "mousemove": 
    case "pointerdown": case "pointerup": case "pointermove": {
      let button = "none";
      if ( ! e.type.endsWith("move") ) {
        if ( e.button == 0 ) {
          button = "left";
        } else {
          button = "right";
        }
      }
      return {
        command : {
          name: "Input.emulateTouchFromMouseEvent",
          params: {
            x: Math.round(e.bitmapX),
            y: Math.round(e.bitmapY),
            type: e.type.endsWith("down") ? "mousePressed" :
              e.type.endsWith("up") ? "mouseReleased" : "mouseMoved",
            button,
            clickCount: !e.type.endsWith("move") ? 1 : 0,
            modifiers: encodeModifiers(e.originalEvent)
          },
          requiresShot: ! e.originalEvent.noShot && e.type.endsWith("down") 
        }
      };
    }
    case "wheel": {
      // if we use emulateTouchFromMouseEvent we need a button value
      const deltaMode = e.originalEvent.deltaMode;
      const deltaX = adjustWheelDeltaByMode(e.originalEvent.deltaX, deltaMode);
      const deltaY = adjustWheelDeltaByMode(e.originalEvent.deltaY, deltaMode);
      const {contextId} = e;
      const clientX = 0;
      const clientY = 0
      const deltas = {deltaX,deltaY,clientX,clientY};
      let retVal;
      if ( deltaX > MIN_DELTA || deltaY > MIN_DELTA ) {
        const retVal1 = {
          command: {
            name: "Runtime.evaluate",
            params: {
              expression: `self.ensureScroll(${JSON.stringify(deltas)});`,
              includeCommandLineAPI: false,
              userGesture: true,
              contextId,
              timeout: SHORT_TIMEOUT
            }
          }
        };
        const retVal2 = mouseEvent(e, deltaX, deltaY);
        retVal = [retVal1,retVal2];
      } else {
        retVal = mouseEvent(e, deltaX, deltaY);
      }
      return retVal;
    }
    case "auth-response": {
      const {requestId, authResponse} = e;
      return {
        command: {
          name: "Fetch.continueWithAuth",
          params: {
            requestId,
            authChallengeResponse: authResponse
          }
        }
      };
    }
    case "control-chars": {
      return keyEvent(e);
    }
    case "typing": {
      //alert(JSON.stringify(e));
      if ( e.isComposing || ! e.characters ) return;
      else return {
        command: {
          name: "Input.insertText",
          params: {
            text: (e.characters || '') 
          },
          requiresShot: true,
          ignoreHash: true
        }
      }
    }
    case "typing-syncValue": {
      if ( ! e.encodedValue ) return;
      else return {
        command: {
          name: "Runtime.evaluate",
          params: {
            expression: `syncFocusedInputToValue("${e.encodedValue}");`,
            includeCommandLineAPI: false,
            userGesture: true,
            contextId: e.contextId,
            timeout: SHORT_TIMEOUT,
          },
          requiresShot: true,
          ignoreHash: true
        }
      }
    }
    case "typing-deleteContentBackward": {
      if ( ! e.encodedValueToDelete ) return;
      else return {
        command: {
          name: "Runtime.evaluate",
          params: {
            expression: `fromFocusedInputDeleteLastOccurrenceOf("${e.encodedValueToDelete}");`,
            includeCommandLineAPI: false,
            userGesture: true,
            contextId: e.contextId,
            timeout: SHORT_TIMEOUT
          },
          requiresShot: true
        }
      }
    }
    case "url-address": {
      return {
        command: {
          name: "Page.navigate",
          params: {
            url: e.address
          },
          requiresLoad: true,
          requiresShot: true,
          requiresTailShot: true
        }
      }
    }
    case "history": {
      switch(e.action) {
        case "reload": case "stop": {
          return {
            command: {
              requiresLoad: e.action == "reload",
              requiresShot: e.action == "reload",
              name: e.action == "reload" ? "Page.reload" : "Page.stopLoading",
              params: {},
            }
          };
        }
        case "back": case "forward": {
          return {chain:[
            {
              command: {
                name: "Page.getNavigationHistory",
                params: {}
              }
            },
            ({currentIndex, entries}) => {
              const intendedEntry = entries[currentIndex + (e.action == "back" ? -1 : +1 )]; 
              if ( intendedEntry ) {
                return {
                  command: {
                    name: "Page.navigateToHistoryEntry",
                    params: {
                      entryId: intendedEntry.id
                    }, 
                    requiresLoad: true,
                    requiresShot: true,
                    requiresTailShot: true
                  }
                };
              } 
            }
          ]};
        }
        default: {
          throw new TypeError(`Unkown history action ${e.action}`);
        }
      }
    }
    case "touchscroll": {
      let {deltaX,deltaY,bitmapX:clientX,bitmapY:clientY,contextId} = e;
      // only one scroll direction at a time
      if ( Math.abs(deltaY) > Math.abs(deltaX) ) {
        deltaX = 0;
        if ( Math.abs(deltaY) > 0.412 * self.ViewportHeight ) {
          deltaY = Math.round(2.718 * deltaY);
        }
      } else {
        deltaY = 0;
        if ( Math.abs(deltaX) > 0.412 * self.ViewportWidth ) {
          deltaX = Math.round(2.718 * deltaX);
        }
      }
      clientX = Math.round(clientX);
      clientY = Math.round(clientY);
      const deltas = {deltaX,deltaY,clientX,clientY};
      const retVal1 = {
        command: {
          name: "Runtime.evaluate",
          params: {
            expression: `self.ensureScroll(${JSON.stringify(deltas)});`,
            includeCommandLineAPI: false,
            userGesture: true,
            contextId,
            timeout: SHORT_TIMEOUT
          }
        }
      };
      const retVal2 = mouseEvent(e, deltaX, deltaY);
      const retVal = [retVal1,retVal2];
      return retVal;
    }
    case "zoom": {
      /** retval does not work. Expanding pinch is OK, but contracting seems to fail **/
      /*
      const retVal = {
        command: {
          name: "Input.synthesizePinchGesture",
          params: {
            relativeSpeed: 300,
            scaleFactor: e.scale,
            gestureSourceType: "touch",
            x: Math.round(e.bitmapX),
            y: Math.round(e.bitmapY)
          },
          requiresShot: true,
          requiresExtraWait: true,
          extraWait: 300
        }
      };
      */
      /** so we are using emulation and multiplying the scale factor in the event listener **/
      const retVal2 = {
        command: {
          name: "Emulation.setPageScaleFactor",
          params: {
            pageScaleFactor: e.scale
          },
          requiresShot: true,
          requiresExtraWait: true,
          extraWait: 300
        }
      }
      return retVal2;
    }
    case "select": {
      const retVal = {
        command : {
          name: "Runtime.evaluate",
          params: {
            expression: `self.setSelectValue("${e.value}");`,
            includeCommandLineAPI: false,
            userGesture: true,
            contextId: e.executionContext,
            timeout: SHORT_TIMEOUT
          },
          requiresShot: true,
          requiresExtraWait: true,
          extraWait: 300
        }
      };
      return retVal;
    }
    case "window-bounds": {
      let {width,height,targetId} = e;
      width = parseInt(width);
      height = parseInt(height);
      const retVal = {chain:[
        {
          command: {
            name: "Browser.getWindowForTarget",
            params: {targetId},
          }
        },
        ({windowId, bounds}) => {
          if ( bounds.width == width && bounds.height == height ) return;
          const retVal = {
            command: {
              name: "Browser.setWindowBounds",
              params: {
                windowId,
                bounds: {width, height}
              },
              requiresWindowId: true
            }
          };
          return retVal;
        }
      ]};
      return retVal;
    }
    case "window-bounds-preImplementation": {
      // This is here until Browser.getWindowForTarget and Browser.setWindowBounds come online
      let {width,height} = e;
      width = parseInt(width);
      height = parseInt(height);
      const retVal = {
          command: {
            name: "Emulation.setVisibleSize",
            params: {width,height},
          },
          requiresShot: true,
      };
      return retVal;
    }
    case "user-agent": {
      const {userAgent, platform, acceptLanguage} = e;
      const retVal = {
        command: {
          name: "Network.setUserAgentOverride",
          params: {
            userAgent, platform,
            acceptLanguage, 
          }
        }
      }
      return retVal;
    }
    case "hide-scrollbars": {
      const retVal = {
        command: {
          name: "Emulation.setScrollbarsHidden",
          params: {
            hidden: true
          }
        }
      }
      return retVal;
    }
    case "buffered-results-collection": {
      return e;
    }
    case "doShot": {
      return {
        command: {
          isZombieLordCommand: true,
          name: "Connection.doShot",
          params: {}
        }
      };
    }
    case "canKeysInput": {
      return {chain:[
        {
          command: {
            isZombieLordCommand: true,
            name: "Connection.getContextIdsForActiveSession",
            params: {
              worldName: WorldName
            }
          }
        },
        ({contextIds}) => contextIds.map(contextId => ({
          command: {
            name: "Runtime.evaluate",
            params: {
              expression: "canKeysInput();",
              contextId: contextId,
              timeout: SHORT_TIMEOUT
            },
          }
        }))
      ]};
    }
    case "getElementInfo": {
      return {chain:[
        {
          command: {
            isZombieLordCommand: true,
            name: "Connection.getContextIdsForActiveSession",
            params: {
              worldName: WorldName
            }
          }
        },
        ({contextIds}) => contextIds.map(contextId => ({
          command: {
            name: "Runtime.evaluate",
            params: {
              expression: `getElementInfo(${JSON.stringify(e.data)});`,
              contextId: contextId,
              timeout: SHORT_TIMEOUT
            },
          }
        }))
      ]};
    }
    case "getFavicon": {
      return {chain:[
        {
          command: {
            isZombieLordCommand: true,
            name: "Connection.getAllContextIds",
            params: {
              worldName: WorldName
            }
          }
        },
        ({sessionContextIdPairs}) => sessionContextIdPairs.map(({sessionId,contextId}) => {
          return {
            command: {
              name: "Runtime.evaluate",
              params: {
                sessionId,
                contextId,
                expression: "getFaviconElement();",
                timeout: SHORT_TIMEOUT
              },
            }
          };
        })
      ]};
    }
    case "newIncognitoTab": {
      return {chain:[
        {
          command: {
            name: "Target.createBrowserContext",
            params: {}
          }
        },
        ({browserContextId}) => {
          return {
            command: {
              name: "Target.createTarget",
              params: {
                browserContextId,
                url: "about:blank",
                enableBeginFrameControl: FRAME_CONTROL
              },
            }
          };
        }
      ]};
    }
    case "isSafari": {
      return {
        command: {
          isZombieLordCommand: true,
          name: "Connection.setIsSafari",
          params: {}
        }
      };
    }
    case "isFirefox": {
      return {
        command: {
          isZombieLordCommand: true,
          name: "Connection.setIsFirefox",
          params: {}
        }
      };
    }
    case "clearAllPageHistory": {
      return {chain:[
        {
          command: {
            isZombieLordCommand: true,
            name: "Connection.getAllSessionIds",
            params: {}
          }
        },
        ({sessionIds}) => sessionIds.map(sessionId => {
          return {
            command: {
              name: "Page.resetNavigationHistory",
              params: {
                sessionId,
              },
            }
          };
        })
      ]};
    }
    case "clearCache": {
      return {
        command: {
          name: "Network.clearBrowserCache",
          params: {}
        }
      };
    }
    case "clearCookies": {
      return {
        command: {
          name: "Network.clearBrowserCookies",
          params: {}
        }
      };
    }
    case "respond-to-modal": {
      let accept = false;
      let {response, sessionId, promptText} = e; 
      if ( response == "ok" ) {
        accept = true;
      }
      return {
        command: {
          name: "Page.handleJavaScriptDialog",
          params: {
            accept, promptText, sessionId
          }
        }
      };
    }
    default: {
      if ( ( !!e.command && !!e.command.name ) || Array.isArray(e) ) {
        handled.type = 'default';
        return e;
      } else {
        handled.type = 'unhandled';
        return;
      }
    }
  }
}

function mouseEvent(e, deltaX = 0, deltaY = 0) { 
  return {
    command : {
      name: "Input.dispatchMouseEvent",
      params: {
        x: Math.round(e.bitmapX),
        y: Math.round(e.bitmapY),
        type: "mouseWheel",
        deltaX, deltaY
      },
      requiresShot: true,
    }
  };
}

function keyEvent(e, modifiers = 0, SYNTHETIC = false) {
  const id = e.key && e.key.length > 1 ? e.key : e.code;
  const def = keys[id];
  const text = e.originalType == "keypress" ? String.fromCharCode(e.keyCode) : undefined;
  modifiers = modifiers || encodeModifiers(e.originalEvent);
  let type;
  if ( e.originalType == "keydown" ) {
    if ( text ) 
      type = "keyDown";
    else 
      type = "rawKeyDown";
  } else if ( e.originalType == "keypress" ) {
    type = "char";
  } else {
    type = "keyUp";
  }
  const retVal = {
    command: {
      name: "Input.dispatchKeyEvent",
      params: {
        type,
        text,
        unmodifiedText: text,
        code: def.code,
        key: def.key,
        windowsVirtualKeyCode: e.keyCode,
        modifiers,
      },
      requiresShot: e.key == "Enter" || e.key == "Tab" || e.key == "Delete",
      ignoreHash: e.key == "Enter" || e.key == "Tab" || e.key == "Delete"
    }
  };
  if ( ! SYNTHETIC && retVal.command.params.key == 'Meta' ) {
    return [
      retVal,
      SYNTHETIC_CTRL(e)
    ];
  }
  return retVal;
}

function encodeModifiers(originalEvent) {
  let modifiers = 0;
  if (originalEvent.altKey ) {
    modifiers += 1;
  }
  if (originalEvent.ctrlKey || originalEvent.metaKey) {
    modifiers += 2;
  }
  if (originalEvent.metaKey ) {
    modifiers += 4;
  } 
  if (originalEvent.shiftKey ) {
    modifiers += 8;
  }

  return modifiers;
}

function adjustWheelDeltaByMode(delta, mode) {
  if ( delta == 0 ) return delta;
  let threshold = Math.abs(delta) > THRESHOLD_DELTA;
  if ( ! threshold ) {
    delta = Math.sqrt(Math.abs(delta))*Math.sign(delta);
  }
  switch(mode) {
    case DOM_DELTA_PIXEL:
      //console.log("pix mode", delta);
      if ( threshold && Math.abs(delta) < MIN_PIX_DELTA ) {
        delta = Math.sign(delta)*MIN_PIX_DELTA;
      }
      break;
    case DOM_DELTA_LINE:
      //console.log("line mode", delta);
      delta = delta * LINE_HEIGHT_GUESS;
      if ( threshold && Math.abs(delta) < MIN_DELTA ) {
        delta = Math.sign(delta)*MIN_DELTA;
      }
      break;
    case DOM_DELTA_PAGE:
      //console.log("page mode", delta);
      delta = delta * self.ViewportHeight;
      if ( threshold && Math.abs(delta) < MIN_DELTA ) {
        delta = Math.sign(delta)*MIN_DELTA;
      }
      break;
  }
  return delta;
}
