const {
  initDefaultOptions,
  initDefaultResources,
  addStandardHttpOptions,
  resolveEnvVariables
} = require('../../libs/service-base');
const { HttpServiceBase } = require('../../libs/http-service-base');
const eventStore = require('../../libs/event-store');
const { profileDB } = require('./database');
const { addAuthProviderOptions, initializeAuthProvider } = require('./auth-provider')
const { extractInfoFromRequest } = require('../../helper');

const asMain = require.main === module;

function parseOptions(argv) {
  let cmd = initDefaultOptions();
  cmd = addStandardHttpOptions(cmd);
  cmd = profileDB.addDatabaseOptions(cmd);
  cmd = addAuthProviderOptions(cmd);
  cmd = eventStore.addEventStoreOptions(cmd);
  cmd.option(
    '--new-login-topic <new-login-topic>',
    'New login topic used to produce new login events'
  );
  return cmd.parse(argv).opts();
}

async function initResource(options) {
  return await initDefaultResources(options)
    .then(profileDB.initializeDatabase)
    .then(initializeAuthProvider)
    .then(eventStore.initializeEventStore({ producer: true }));
}

class ProfileMs extends HttpServiceBase {
  constructor(context) {
    super(context);
    /** @type {import('./database/profile/profile-db').IProfileDB } */
    this.profileDB = context.profileDB;
    /** @type {import('./auth-provider/auth-provider').IAuthProvider} */
    this.authProvider = context.authProvider;
    /** @type {import('../../libs/event-store/iEventStore').IEventStore} */
    this.eventStore = context.eventStore;
    this.newLoginTopic = this.options.newLoginTopic;
  }

  async init() {
    await super.init();

    this.addRoute('/auth', ['GET', 'POST'], async (req, res) => {
      const username = extractInfoFromRequest(req, 'user');
      const accesskey = extractInfoFromRequest(req, 'accesskey');
      try {
        this.authProvider.verifyAccessKey(username, accesskey);
      } catch {
        return res.response({}).code(401);
      }
      return res.response({}).code(200);
    });

    this.addRoute('/login', 'POST', async (req, res) => {
      const { payload } = req;
      const { username } = payload;
      const token = extractInfoFromRequest(req, 'token');
      let isNew = false;
      let result;
      try {
        result = await this.authProvider.decodeExternalToken(token);
      } catch (error) {
        this.log.error(`Error while authentication : ${error}`);
        return res.response({}).code(401);
      }
      const isExist = await this.profileDB.isExits(username);
      if (!isExist) {
        isNew = true;
        const profile = {
          username,
          uid: result.uid,
          addedOn: new Date(),
          isActive: true
        };
        await this.profileDB.create(profile);
      }
      const accesskey = await this.authProvider.generateAccessKey(username);
      this.eventStore.emit(this.newLoginTopic, payload, username);
      return {
        status: true,
        username,
        accesskey,
        isNew
      };
    });

    this.addRoute('/get', 'GET', async (req) => {
      const username = extractInfoFromRequest(req);
      if (!username) {
        return {};
      }
      const user = await this.profileDB.findActiveUser(username, { name: 1, username: 1 });
      return user || {};
    });

    this.addRoute('/user/sync', 'POST', async (req) => {
      const username = extractInfoFromRequest(req);
      const { users = [] } = req.payload;
      const result = await this.profileDB.contactBookSyncByUsername(username, users);
      return result || {};
    });
  }

  async shutdown() {
    await super.shutdown();
    await this.profileDB.dispose();
    await this.authProvider.dispose();
  }
}

if (asMain) {
  const argv = resolveEnvVariables(process.argv);
  const options = parseOptions(argv);
  initResource(options)
    .then(async (context) => {
      await new ProfileMs(context).run();
    })
    .catch(async (error) => {
      // eslint-disable-next-line no-console
      console.error('Failed to initialized Profile MS', error);
      process.exit(1);
    });
}
