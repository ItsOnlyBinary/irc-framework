'use strict';

/* globals describe, it */
const chai = require('chai');
const assert = chai.assert;
const NetworkInfo = require('../src/networkinfo');
const IrcCommand = require('../src/commands/command');
const IrcCommandHandler = require('../src/commands/handler');

function newMockClient() {
    const handler = new IrcCommandHandler({ network: new NetworkInfo() });
    return handler;
}

describe('src/networkinfo.js', function() {
    describe('isChannelName', function() {
        const names = ['chan', '#chan', '.chan', '%chan', '&#chan', '%#chan'];

        it('should identify names as channels when CHANTYPES is not given', function() {
            const client = newMockClient();
            const results = names.map(name => client.network.isChannelName(name));
            assert.deepEqual(results, [false, true, false, false, true, false]);
        });

        it('should identify names as channels when CHANTYPES is standard', function() {
            const client = newMockClient();
            const irc_command = new IrcCommand('005', {
                command: '005',
                params: ['nick', 'CHANTYPES=#&'],
                tags: []
            });
            client.dispatch(irc_command);
            const results = names.map(name => client.network.isChannelName(name));
            assert.deepEqual(results, [false, true, false, false, true, false]);
        });

        it('should identify names as channels when CHANTYPES is non-standard', function() {
            const client = newMockClient();
            const irc_command = new IrcCommand('005', {
                command: '005',
                params: ['nick', 'CHANTYPES=%'],
                tags: []
            });
            client.dispatch(irc_command);
            const results = names.map(name => client.network.isChannelName(name));
            assert.deepEqual(results, [false, false, false, true, false, true]);
        });

        it('should not identify any names as channels when no CHANTYPES are supported', function() {
            const client = newMockClient();
            const irc_command = new IrcCommand('005', {
                command: '005',
                params: ['nick', 'CHANTYPES='],
                tags: []
            });
            client.dispatch(irc_command);
            const results = names.map(name => client.network.isChannelName(name));
            assert.deepEqual(results, [false, false, false, false, false, false]);
        });
    });
});
