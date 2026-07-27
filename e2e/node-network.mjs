import dns from "node:dns";
import { Agent, setGlobalDispatcher } from "undici";

const lookup = (hostname, options, callback) => {
  dns.lookup(hostname, { family: 4 }, (error, address, family) => {
    if (options?.all) {
      callback(error, error ? undefined : [{ address, family }]);
      return;
    }
    callback(error, address, family);
  });
};

setGlobalDispatcher(
  new Agent({
    connect: {
      autoSelectFamily: false,
      lookup,
    },
  }),
);
