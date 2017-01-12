import express from 'express';
import crypto from 'crypto';
import bodyParser from 'body-parser';
import zipcode from 'zipcode';
import request from "request";

// Watson Work Services URL
const watsonWork = "https://api.watsonwork.ibm.com";

//
const responses=["It is certain",
                 "It is decidedly so",
                 "Without a doubt",
                 "Yes, definitely",
                 "You may rely on it",
                 "As I see it, yes",
                 "Most likely",
                 "Yes",
                 "Signs point to yes",
                 "Reply hazy try again",
                 "Ask again later",
                 "Better not tell you now",
                 "Concentrate and ask again",
                 "Don't count on it",
                 "My reply is no",
                 "My sources say no",
                 "Outlook not so good",
                 "Very doubtful",
                 "Ask Anton",
                 "Visit Cork, I hear its lovely this time of year!"]

// Application Id, obtained from registering the application at https://developer.watsonwork.ibm.com
const appId = process.env.NEWRELIC_CLIENT_ID;

// Application secret. Obtained from registration of application.
const appSecret = process.env.NEWRELIC_CLIENT_SECRET;

// Webhook secret. Obtained from registration of a webhook.
const webhookSecret = process.env.NEWRELIC_WEBHOOK_SECRET;

const newrelic_auth = {
  newrelic_license: process.env.NEWRELIC_LICENSE_KEY,
  newrelic_api_key: process.env.NEWRELIC_API_KEY
}
// Keyword to "listen" for when receiving outbound webhook calls.
const webhookKeyword = "@magic8ball";

const failMessage =
`Hey, maybe it's me... maybe it's NewRelic, but I sense the fail whale should be here... Try again later`;

const app = express();

// Send 200 and empty body for requests that won't be processed.
const ignoreMessage = (res) => {
  res.status(200).end();
}

// Process webhook verification requests
const verifyCallback = (req, res) => {
  console.log("Verifying challenge");
  console.log(req.body);
  const bodyToSend = {
    response: req.body.challenge
  };

  // Create a HMAC-SHA256 hash of the recieved body, using the webhook secret
  // as the key, to confirm webhook endpoint.
  const hashToSend =
    crypto.createHmac('sha256', webhookSecret)
    .update(JSON.stringify(bodyToSend))
    .digest('hex');

  res.set('X-OUTBOUND-TOKEN', hashToSend);
  res.send(bodyToSend).end();
};

// Validate events coming through and process only message-created or verification events.
const validateEvent = (req, res, next) => {

  // Event to Event Handler mapping
  const processEvent = {
    'verification': verifyCallback,
    'message-created': () => next()
  };

  // If event exists in processEvent, execute handler. If not, ignore message.
  return (processEvent[req.body.type]) ?
    processEvent[req.body.type](req, res) : ignoreMessage(res);
};

// Authenticate Application
const authenticateApp = (callback) => {

  // Authentication API
  const authenticationAPI = 'oauth/token';

  const authenticationOptions = {
    "method": "POST",
    "url": `${watsonWork}/${authenticationAPI}`,
    "auth": {
      "user": appId,
      "pass": appSecret
    },
    "form": {
      "grant_type": "client_credentials"
    }
  };

  request(authenticationOptions, (err, response, body) => {
    // If can't authenticate just return
    if (response.statusCode != 200) {
      console.log("Error authentication application. Exiting.");
      process.exit(1);
    }
    callback(JSON.parse(body).access_token);
  });
};

// Send message to Watson Workspace
const sendMessage = (spaceId, title, message, state) => {

  // Spaces API
  const spacesAPI = `v1/spaces/${spaceId}/messages`;

  // Photos API
  const photosAPI = `photos`;

  let colorHex = '#1DA1F2';
  if(state === 'open') {
    colorHex = '#CC0000';
  }else if (state === 'closed') {
    colorHex = '#32CD32';
  }

  // Format for sending messages to Workspace
  const messageData = {
    type: "appMessage",
    version: 1.0,
    annotations: [
      {
        type: "generic",
        version: 1.0,
        color: colorHex,
        title: title,
        text: message
      }
    ]
  };

  // Authenticate application and send message.
  authenticateApp( (jwt) => {

    const sendMessageOptions = {
      "method": "POST",
      "url": `${watsonWork}/${spacesAPI}`,
      "headers": {
        "Authorization": `Bearer ${jwt}`
      },
      "json": messageData
    };

    request(sendMessageOptions, (err, response, body) => {
      if(response.statusCode != 201) {
        console.log("Error posting newrelic information.");
        console.log(response.statusCode);
        console.log(err);
      }
    });
  });
};

// Ensure we can parse JSON when listening to requests
app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send('IBM Watson Workspace Integration for NewRelic is alive and happy!');
});

// This is callback URI that Watson Workspace will call when there's a new message created
app.post('/webhook', validateEvent, (req, res) => {

  // Check if the first part of the message is '@magic8ball'.
  // This lets us "listen" for the '@magic8ball' keyword.
  if (req.body.content.indexOf(webhookKeyword) != 0) {
    ignoreMessage(res);
    return;
  }

  // Send status back to Watson Work to confirm receipt of message
  res.status(200).end();

  // Id of space where outbound event originated from.
  const spaceId = req.body.spaceId;

  // Parse newrelic query from message body.
  // Expected format: <keyword>
  sendMessage(spaceId,'Echo', _.shuffle(responses)[0];);

});

app.post('/alert/:spaceId', (req, res) => {
  console.log(JSON.stringify(req.body));

  // Send Respone back to New Relic.
  res.status(200).end();

  // TODO: Check for precence of condition_name
  const targets = req.body.targets;
  sendMessage(req.params.spaceId,'Incident '+req.body.current_state+' '+targets[0].name+' '+req.body.condition_name,req.body.details+'\n'+'Link: '+'[Incident '+req.body.incident_id+']('+req.body.incident_url+')',req.body.current_state);

});

console.log('VERSION: 1.00');
// Kickoff the main process to listen to incoming requests
app.listen(process.env.PORT || 3000, () => {
  console.log('NewRelic app is listening on the port');
});
