'use strict';
if(process.argv.includes('--host')) require('./host-main.cjs');
else if(process.argv.includes('--simulate-legion-go')) require('./simulator-main.cjs');
else require('./client-main.cjs');
