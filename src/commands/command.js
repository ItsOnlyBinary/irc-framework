'use strict';

const irc_numerics = require('./numerics');

const _ = {
    clone: require('lodash/clone'),
};

const numberRegex = /^[0-9.]{1,}$/;

module.exports = class IrcCommand {
    constructor(command, data) {
        this.command = (command || '').toUpperCase();
        this.params = _.clone(data.params);
        this.tags = _.clone(data.tags);

        this.prefix = data.prefix;
        this.nick = data.nick;
        this.ident = data.ident;
        this.hostname = data.hostname;

        this.handled = false;

        let command_name = null;
        Object.defineProperty(this, 'command_name', {
            enumerable: true,
            get: function() {
                if (command_name === null) {
                    command_name = irc_numerics[this.command];
                }
                return command_name;
            },
        });
    }

    getTag(tag_name) {
        return this.tags[tag_name.toLowerCase()];
    }

    getServerTime() {
        const timeTag = this.getTag('time');

        // Explicitly return undefined if theres no time
        // or the value is an empty string
        if (!timeTag) {
            return undefined;
        }

        // If parsing fails for some odd reason, also fallback to
        // undefined, instead of returning NaN
        const time = Date.parse(timeTag) || undefined;

        // Support for znc.in/server-time unix timestamps
        if (!time && numberRegex.test(timeTag)) {
            return new Date(timeTag * 1000).getTime();
        }

        return time;
    }
};
