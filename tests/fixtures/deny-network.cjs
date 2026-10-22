const deny = () => {
  throw new Error('Network disabled during offline package verification');
};
globalThis.fetch = deny;
require('node:net').connect = deny;
require('node:net').createConnection = deny;
require('node:http').request = deny;
require('node:http').get = deny;
require('node:https').request = deny;
require('node:https').get = deny;
