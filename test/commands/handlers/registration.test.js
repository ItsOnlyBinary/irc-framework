'use strict';

/* globals describe, it */
const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const registration = require('../../../src/commands/handlers/registration');
const IrcCommand = require('../../../src/commands/command');

chai.use(require('sinon-chai'));

function createMockHandler() {
    const handlers = {};
    const spies = {
        emit: sinon.stub(),
        connection: {
            write: sinon.stub(),
            options: {},
            end: sinon.stub()
        },
        network: {
            cap: {
                negotiating: false,
                requested: [],
                enabled: [],
                available: new Map(),
                isEnabled: function(cap) {
                    return this.enabled.indexOf(cap) > -1;
                }
            },
            options: {}
        },
        client: {
            options: {
                message_max_length: 500
            }
        },
        request_extra_caps: []
    };

    registration({
        addHandler: function(command, handler) {
            handlers[command] = handler;
        }
    });

    return { handlers, spies };
}

describe('src/commands/handlers/registration.js CAP', function() {
    it('should request multiple CAPs and split them if they exceed message_max_length', function() {
        const { handlers, spies } = createMockHandler();
        spies.client.options.message_max_length = 30; // Very small for testing splitting

        // Mock CAP LS with many capabilities
        const cmd = new IrcCommand('CAP', {
            params: ['*', 'LS', 'cap1 cap2 cap3 cap4 cap5']
        });

        // Add some "want" caps via request_extra_caps
        spies.request_extra_caps.push({ cap: 'cap1' });
        spies.request_extra_caps.push({ cap: 'cap2' });
        spies.request_extra_caps.push({ cap: 'cap3' });
        spies.request_extra_caps.push({ cap: 'cap4' });
        spies.request_extra_caps.push({ cap: 'cap5' });

        handlers.CAP(cmd, spies);

        // Should have requested them when multi-line LS ends
        const cmdEnd = new IrcCommand('CAP', {
            params: ['*', 'LS', 'cap1 cap2 cap3 cap4 cap5']
        });
        handlers.CAP(cmdEnd, spies);

        // 30 chars max length. "CAP REQ :" is 9 chars.
        // Remaining: 21 chars.
        // "cap1 cap2 cap3" is 4+1+4+1+4 = 14 chars. + 9 = 23 (OK)
        // "cap1 cap2 cap3 cap4" is 14+1+4 = 19 chars. + 9 = 28 (OK)
        // "cap1 cap2 cap3 cap4 cap5" is 19+1+4 = 24 chars. + 9 = 33 (Too long!)

        // Expected calls:
        // CAP REQ :cap1 cap2 cap3 cap4
        // CAP REQ :cap5
        expect(spies.connection.write).to.have.been.calledWith('CAP REQ :cap1 cap2 cap3 cap4');
        expect(spies.connection.write).to.have.been.calledWith('CAP REQ :cap5');
    });

    it('should handle conditional CAP requests (string condition)', function() {
        const { handlers, spies } = createMockHandler();

        spies.request_extra_caps.push({ cap: 'echo-message', condition: 'labeled-response' });

        // Scenario 1: labeled-response is NOT available
        const cmd1 = new IrcCommand('CAP', {
            params: ['*', 'LS', 'echo-message']
        });
        handlers.CAP(cmd1, spies);
        expect(spies.network.cap.requested).to.not.contain('echo-message');

        // Scenario 2: labeled-response IS available
        spies.network.cap.requested = [];
        spies.request_extra_caps.push({ cap: 'labeled-response' });
        const cmd2 = new IrcCommand('CAP', {
            params: ['*', 'LS', 'echo-message labeled-response']
        });
        handlers.CAP(cmd2, spies);
        expect(spies.network.cap.requested).to.contain('echo-message');
        expect(spies.network.cap.requested).to.contain('labeled-response');
    });

    it('should handle conditional CAP requests (function condition)', function() {
        const { handlers, spies } = createMockHandler();

        const condition = (caps) => caps.indexOf('capA') !== -1 && caps.indexOf('capB') !== -1;
        spies.request_extra_caps.push({ cap: 'capC', condition: condition });

        // Scenario 1: Only capA available
        const cmd1 = new IrcCommand('CAP', {
            params: ['*', 'LS', 'capA capC']
        });
        handlers.CAP(cmd1, spies);
        expect(spies.network.cap.requested).to.not.contain('capC');

        // Scenario 2: capA and capB available
        spies.network.cap.requested = [];
        const cmd2 = new IrcCommand('CAP', {
            params: ['*', 'LS', 'capA capB capC']
        });
        handlers.CAP(cmd2, spies);
        expect(spies.network.cap.requested).to.contain('capC');
    });

    it('should handle conditional CAP requests (array condition)', function() {
        const { handlers, spies } = createMockHandler();

        spies.request_extra_caps.push({ cap: 'capC', condition: ['capA', 'capB'] });

        // Scenario 1: Only capA available
        const cmd1 = new IrcCommand('CAP', {
            params: ['*', 'LS', 'capA capC']
        });
        handlers.CAP(cmd1, spies);
        expect(spies.network.cap.requested).to.not.contain('capC');

        // Scenario 2: capA and capB available
        spies.network.cap.requested = [];
        const cmd2 = new IrcCommand('CAP', {
            params: ['*', 'LS', 'capA capB capC']
        });
        handlers.CAP(cmd2, spies);
        expect(spies.network.cap.requested).to.contain('capC');
    });

    it('should handle mutual dependencies', function() {
        const { handlers, spies } = createMockHandler();

        spies.request_extra_caps.push({ cap: 'echo-message', condition: 'labeled-response' });
        spies.request_extra_caps.push({ cap: 'labeled-response', condition: 'echo-message' });

        // Scenario 1: Only echo-message available
        const cmd1 = new IrcCommand('CAP', {
            params: ['*', 'LS', 'echo-message']
        });
        handlers.CAP(cmd1, spies);
        expect(spies.network.cap.requested).to.not.contain('echo-message');

        // Scenario 2: Only labeled-response available
        spies.network.cap.requested = [];
        const cmd2 = new IrcCommand('CAP', {
            params: ['*', 'LS', 'labeled-response']
        });
        handlers.CAP(cmd2, spies);
        expect(spies.network.cap.requested).to.not.contain('labeled-response');

        // Scenario 3: Both available
        spies.network.cap.requested = [];
        const cmd3 = new IrcCommand('CAP', {
            params: ['*', 'LS', 'echo-message labeled-response']
        });
        handlers.CAP(cmd3, spies);
        expect(spies.network.cap.requested).to.contain('echo-message');
        expect(spies.network.cap.requested).to.contain('labeled-response');
    });

    it('should automatically remove dependent CAPs when a required CAP is deleted', function() {
        const { handlers, spies } = createMockHandler();

        spies.request_extra_caps.push({ cap: 'echo-message', condition: 'labeled-response' });

        // Initially enable both
        spies.network.cap.enabled = ['echo-message', 'labeled-response'];

        // Server deletes labeled-response
        const cmd = new IrcCommand('CAP', {
            params: ['*', 'DEL', 'labeled-response']
        });
        handlers.CAP(cmd, spies);

        expect(spies.network.cap.enabled).to.not.contain('labeled-response');
        expect(spies.connection.write).to.have.been.calledWith('CAP REQ :-echo-message');
    });

    it('should request NEW capabilities if they are wanted', function() {
        const { handlers, spies } = createMockHandler();
        spies.request_extra_caps.push({ cap: 'new-cap' });

        const cmd = new IrcCommand('CAP', {
            params: ['*', 'NEW', 'new-cap ignored-cap']
        });
        handlers.CAP(cmd, spies);

        expect(spies.connection.write).to.have.been.calledWith('CAP REQ :new-cap');
        expect(spies.network.cap.requested).to.contain('new-cap');
    });
});
