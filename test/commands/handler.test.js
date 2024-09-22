'use strict';

/* globals describe, it */
/* eslint-disable no-unused-expressions */
const sinon = require('sinon');
const chai = require('chai');
const expect = chai.expect;
const ircLineParser = require('../../src/irclineparser');
const NetworkInfo = require('../../src/networkinfo');
const IrcCommandHandler = require('../../src/commands/handler');

function newMockClient() {
    console.log();

    const mockClient = {
        network: new NetworkInfo(),
    };

    const handler = new IrcCommandHandler(mockClient);

    // handler.emit = (...args) => {
    //     if (args[0] === 'privmsg') {
    //         return;
    //     }
    //     console.log('emit:', JSON.stringify(args, null, 2));
    // };

    mockClient.command_handler = handler;
    mockClient.spies = {
        emit: sinon.spy(handler, 'emit'),
    };
    return mockClient;
}

describe('src/handler.js', function() {
    describe('BATCH support', function() {
        it('should correctly handle simple batches', function() {
            const lines = [
                ':irc.host BATCH +yXNAbvnRHTRBv netsplit irc.hub other.host',
                '@batch=yXNAbvnRHTRBv :aji!a@a QUIT :irc.hub other.host',
                '@batch=yXNAbvnRHTRBv :nenolod!a@a QUIT :irc.hub other.host',
                ':nick!user@host PRIVMSG #channel :This is not in batch, so processed immediately',
                '@batch=yXNAbvnRHTRBv :jilles!a@a QUIT :irc.hub other.host',
                ':irc.host BATCH -yXNAbvnRHTRBv',
            ];
            const mockClient = newMockClient();

            lines.forEach((line) => {
                const ircLine = ircLineParser(line);
                mockClient.command_handler.dispatch(ircLine);
            });

            expect(mockClient.spies.emit).to.have.been.called;

            expect(mockClient.spies.emit).to.have.been.calledWithMatch(
                'batch end',
                sinon.match({
                    id: 'yXNAbvnRHTRBv',
                    type: 'netsplit',
                    params: sinon.match((val) => Array.isArray(val) && val.length === 2),
                    commands: sinon.match((val) => Array.isArray(val) && val.length === 3),
                }),
            );
        });

        it('should correctly handle interleaving batches', function() {
            const lines = [
                ':irc.host BATCH +1 example.com/foo',
                '@batch=1 :nick!user@host PRIVMSG #channel :Message 1',
                ':irc.host BATCH +2 example.com/foo',
                '@batch=1 :nick!user@host PRIVMSG #channel :Message 2',
                '@batch=2 :nick!user@host PRIVMSG #channel :Message 4',
                '@batch=1 :nick!user@host PRIVMSG #channel :Message 3',
                ':irc.host BATCH -1',
                '@batch=2 :nick!user@host PRIVMSG #channel :Message 5',
                ':irc.host BATCH -2',
            ];

            const mockClient = newMockClient();
            lines.forEach((line) => {
                const ircLine = ircLineParser(line);
                mockClient.command_handler.dispatch(ircLine);
            });

            expect(mockClient.spies.emit).to.have.been.called;

            expect(mockClient.spies.emit).to.have.been.calledWithMatch(
                'batch end',
                sinon.match({
                    id: '1',
                    type: 'example.com/foo',
                    params: [],
                    commands: sinon.match((val) => Array.isArray(val) && val.length === 3),
                }),
            );

            expect(mockClient.spies.emit).to.have.been.calledWithMatch(
                'batch end',
                sinon.match({
                    id: '2',
                    type: 'example.com/foo',
                    params: [],
                    commands: sinon.match((val) => Array.isArray(val) && val.length === 2),
                }),
            );
        });

        // it('should correctly handle nested batches', function() {
        //     const lines = [
        //         ':irc.host BATCH +outer example.com/foo',
        //         '@batch=outer :irc.host BATCH +inner example.com/bar',
        //         '@batch=inner :nick!user@host PRIVMSG #channel :Hi',
        //         '@batch=outer :irc.host BATCH -inner',
        //         ':irc.host BATCH -outer',
        //     ];

        //     const mockClient = newMockClient();
        //     lines.forEach((line) => {
        //         const ircLine = ircLineParser(line);
        //         mockClient.command_handler.dispatch(ircLine);
        //     });

        //     expect(mockClient.spies.emit).to.have.been.called;

        //     expect(mockClient.spies.emit).to.have.been.calledWithMatch(
        //         'batch end',
        //         sinon.match({
        //             id: 'outer',
        //             type: 'example.com/foo',
        //             params: [],
        //             commands: [sinon.match((val) => Array.isArray(val) && val.length === 1)],
        //         }),
        //     );

        //     expect(mockClient.spies.emit).to.have.been.calledWithMatch(
        //         'batch end',
        //         sinon.match({
        //             id: 'inner',
        //             type: 'example.com/foo',
        //             params: [],
        //             commands: sinon.match((val) => Array.isArray(val) && val.length === 1),
        //         }),
        //     );
        // });
    });
});
