const NodeHelper = require("node_helper");
const Log = require("logger");

const bodyParser = require('body-parser');
const { regex } = require("envsub/main.config");

module.exports = NodeHelper.create({
	// Override start method.
	start () {
		Log.log(`Starting node helper for: ${this.name}`);
        this.expressApp.use(bodyParser.json());
        this.startWebhookServer();
        this.mode = "CONNECTING"
        this.turbidity = 0
	},

    socketNotificationReceived: function(notification, payload) {
        Log.info("Event received: " + notification + " " + payload)
        if (notification == "STARTED") {
            this.updateModule();
        }
    },

    // Webhook server to receive updates from external shower controller
    startWebhookServer: function () {
        this.expressApp.post("/shower-update", (req, res) => {
            Log.info("got shower update webook: " + JSON.stringify(req.body, null, 2))
            if (req.body && req.body.mode && req.body.turbidity !== undefined) {
                Log.info("sending notification <mode: " + req.body.mode + ", turbidity: " + req.body.turbidity + ">")
                this.mode = req.body.mode;
                this.turbidity = req.body.turbidity;
                this.updateModule();
                Log.info("SHOWER_UPDATE_EVENT notification sent");
                res.sendStatus(200);
            } else {
                res.sendStatus(400);
            }
        });
    },

    updateModule: function () {
        this.sendSocketNotification("SHOWER_UPDATE_EVENT", {
            mode: this.mode,
            turbidity: this.turbidity
        });
    }
});
