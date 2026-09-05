// Minimal ambient declaration so the library type-checks without the optional
// `node-hid` native module installed. Consumers that use the Node transport
// install `node-hid` themselves; its real types (if present) don't conflict
// because this only kicks in when the package is absent.
declare module 'node-hid';
