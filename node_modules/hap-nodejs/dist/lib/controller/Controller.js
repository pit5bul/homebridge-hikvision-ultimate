"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DefaultControllerType = void 0;
exports.isSerializableController = isSerializableController;
/**
 * @group Controller API
 */
var DefaultControllerType;
(function (DefaultControllerType) {
    DefaultControllerType["CAMERA"] = "camera";
    DefaultControllerType["REMOTE"] = "remote";
    DefaultControllerType["TV"] = "tv";
    DefaultControllerType["ROUTER"] = "router";
    DefaultControllerType["LOCK"] = "lock";
    DefaultControllerType["CHARACTERISTIC_TRANSITION"] = "characteristic-transition";
})(DefaultControllerType || (exports.DefaultControllerType = DefaultControllerType = {}));
/**
 * @param controller
 * @group Controller API
 */
function isSerializableController(controller) {
    return "serialize" in controller && "deserialize" in controller && "setupStateChangeDelegate" in controller;
}
//# sourceMappingURL=Controller.js.map