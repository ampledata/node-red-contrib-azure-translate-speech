var request = require('request');
var sdk = require('microsoft-cognitiveservices-speech-sdk');

module.exports = function (RED) {
    function translator (config) {
        RED.nodes.createNode(this,config);
        var node = this;

        node.on('input', function (msg) {
            node.status({fill: "blue", shape: "dot", text: "Requesting"});

            if (msg.payload == null) {
                node.error("Error with payload : null", msg);
                node.status({fill: "red", shape: "ring", text: "Error"});
                return;
            }

            if (this.credentials == null || this.credentials.key == null || this.credentials.key == "") {
                node.error("Input subscription key", msg);
                node.status({fill: "red", shape: "ring", text: "Error"});
                console.log("Input subscription key");
            } else {
                var serviceRegion = "westus";

                // create the push stream we need for the speech sdk.
                var pushStream = sdk.AudioInputStream.createPushStream();

                // Convert binary buffer to an Array Buffer
                var b = msg.payload;
                var ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

                pushStream.write(ab);
                pushStream.close();

                // now create the audio-config pointing to our stream and
                // the speech config specifying the language.
                var audioConfig = sdk.AudioConfig.fromStreamInput(
                    pushStream);

                var translationConfig = sdk.SpeechTranslationConfig.fromSubscription(
                    node.credentials.key, serviceRegion);

                // setting the recognition language to English.
                translationConfig.speechRecognitionLanguage = config.from;

                // target language is German.
                translationConfig.addTargetLanguage(config.to);

                //var GermanVoice = "Microsoft Server Speech Text to Speech Voice (de-DE, Hedda)";
                //translationConfig.voiceName = "Microsoft Server Speech Text to Speech Voice (ko-KR, HeamiRUS)";
                console.log(config.voice);
                translationConfig.voiceName = config.voice;

                var recognizer = new sdk.TranslationRecognizer(
                    translationConfig, audioConfig);

                var canceled = false;
                var inTurn = false;

                var synthCount = 0;
                var synthFragmentCount = 0;

                var rEvents = {};

                // Before beginning speech recognition, setup the callbacks to be invoked when an event occurs.

                // The event recognizing signals that an intermediate recognition result is received.
                // You will receive one or more recognizing events as a speech phrase is recognized, with each containing
                // more recognized speech. The event will contain the text for the recognition since the last phrase was recognized.
                // Both the source language text and the translation text(s) are available.
                recognizer.recognizing = function (s, e) {
                    var str = ("(recognizing) Reason: " + sdk.ResultReason[e.result.reason] + " Text: " + e.result.text + " Translations:");

                    var language = "de";
                    str += " [" + language + "] " + e.result.translations.get(language);

                    console.log(str);
                };

                // console.log(recognizer);

                recognizer.synthesizing = function (s, e) {
                  console.log('synthesizing');
                  switch (e.result.reason) {
                      case sdk.ResultReason.Canceled:
                          done.fail(sdk.ResultReason[e.result.reason]);
                          break;
                      case sdk.ResultReason.SynthesizingAudio:
                          var result = e.result.audio;
                          rEvents[synthFragmentCount++] = result;
                          // TODO: Probably don't want to return immediately here:
                          msg.payload = Buffer.from( new Uint8Array(rEvents[0]) );
                          node.send(msg);
                          node.status({});
                          break;
                      case sdk.ResultReason.SynthesizingAudioCompleted:
                          synthCount++;
                          break;
                  }
                };

                recognizer.canceled = function (s, e) {

                    try {
                        switch (e.reason) {
                            case sdk.CancellationReason.Error:
                                done.fail(e.errorDetails);
                                break;
                            case sdk.CancellationReason.EndOfStream:
                                expect(synthCount).toEqual(1);
                                canceled = true;
                                break;
                        }
                    } catch (error) {
                        done.fail(error);
                    }
                };

                recognizer.sessionStarted = function () {
                    inTurn = true;
                };

                recognizer.sessionStopped = function () {
                    inTurn = false;
                };

                // The event recognized signals that a final recognition result is received.
                // This is the final event that a phrase has been recognized.
                // For continuous recognition, you will get one recognized event for each phrase recognized.
                // Both the source language text and the translation text(s) are available.
                recognizer.recognized = function (s, e) {
                    var str = "\r\n(recognized)  Reason: " + sdk.ResultReason[e.result.reason] + " Text: " + e.result.text + " Translations:";

                    var language = "de";
                    str += " [" + language + "] " + e.result.translations.get(language);
                    str += "\r\n";

                    console.log(str);
                    console.log(e.result);
                };

                // start the recognizer and wait for a result.
                recognizer.startContinuousRecognitionAsync(
                    function (result) {
                      console.log('startContinuousRecognitionAsync');
                      console.log(result);
                      // recognizer.close();
                      // recognizer = undefined;
                    },
                    function (err) {
                      recognizer.close();
                      recognizer = undefined;
                });
            }
        });
    }

    RED.nodes.registerType("Translate Speech", translator, {
        credentials: {
            key: {
                type: "password"
            }
        }
    });
};
