#!/usr/bin/env node
/*
Azure Translate Speech Nodes.

Author:: Greg Albrecht <gba@orionlabs.io>
Copyright:: Copyright 2019 Orion Labs, Inc.
License:: Apache License, Version 2.0
Source:: https://github.com/ampledata/node-red-contrib-azure-translate-speech
*/

/* jslint node: true */
/* jslint white: true */

'use strict';

var sdk = require('microsoft-cognitiveservices-speech-sdk');


module.exports = function(RED) {
  function translator(config) {
    RED.nodes.createNode(this, config);
    var node = this;
    var serviceRegion = 'westus';

    node.on('input', function(msg) {
      node.status({fill: 'blue', shape: 'dot', text: 'Requesting'});
      node.debug('this.credentials=' + JSON.stringify(this.credentials));

      if (this.credentials === null || this.credentials.key === null || this.credentials.key === "") {
        node.error('Input subscription key', msg);
        node.status({
          fill: 'red', shape: 'ring', text: 'Input subscription key'});
        return;
      }

      if (msg.payload === null) {
        node.error('Empty Payload ', msg);
        node.status({fill: 'red', shape: 'ring', text: 'Empty Payload'});
        return;
      }

      // create the push stream we need for the speech sdk.
      var pushStream = sdk.AudioInputStream.createPushStream();

      // Convert binary buffer to an Array Buffer
      var b = msg.payload;
      var ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

      pushStream.write(ab);
      pushStream.close();

      // now create the audio-config pointing to our stream and
      // the speech config specifying the language.
      var audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);

      var translationConfig = sdk.SpeechTranslationConfig.fromSubscription(
          node.credentials.key, serviceRegion);

      translationConfig.speechRecognitionLanguage = config.from;
      translationConfig.addTargetLanguage(config.to);
      translationConfig.voiceName = config.voice;

      node.debug('from=' + config.from);
      node.debug('to=' + config.to);
      node.debug('voice=' + config.voice);

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
      recognizer.recognizing = function(s, e) {
        var log = '(Recognizing) reason="';
        log += sdk.ResultReason[e.result.reason] + '" text="' + e.result.text;
        log += '" translations="[' + config.to + ']"';
        node.debug(log);
      };

      recognizer.synthesizing = function(s, e) {
        switch (e.result.reason) {
          case sdk.ResultReason.Canceled:
            node.debug('(Synthesizing) case sdk.ResultReason.Canceled');
            node.debug('(Synthesizing) reason="' + sdk.ResultReason[e.result.reason]) + '"';
            break;
          case sdk.ResultReason.SynthesizingAudio:
            node.debug('(Synthesizing) case sdk.ResultReason.SynthesizingAudio');
            var result = e.result.audio;
            rEvents[synthFragmentCount++] = result;
            // TODO: Probably don't want to return immediately here:
            msg.payload = Buffer.from(new Uint8Array(rEvents[0]));
            node.send(msg);
            node.status({});
            break;
          case sdk.ResultReason.SynthesizingAudioCompleted:
            node.debug('(Synthesizing) case sdk.ResultReason.SynthesizingAudioCompleted');
            synthCount++;
            break;
        }
      };

      recognizer.canceled = function(s, e) {
        node.debug('(Canceled)');
        try {
          switch (e.reason) {
            case sdk.CancellationReason.Error:
              node.debug('e.errorDetails=' + e.errorDetails);
              break;
            case sdk.CancellationReason.EndOfStream:
              //expect(synthCount).toEqual(1);
              canceled = true;
              break;
          }
        } catch (error) {
          node.debug('error=' + error);
        }
      };

      recognizer.sessionStarted = function() {
        inTurn = true;
      };

      recognizer.sessionStopped = function() {
        inTurn = false;
      };

      // The event recognized signals that a final recognition result is received.
      // This is the final event that a phrase has been recognized.
      // For continuous recognition, you will get one recognized event for each phrase recognized.
      // Both the source language text and the translation text(s) are available.
      recognizer.recognized = function(s, e) {
        var log = '(Recognized) reason="';
        log += sdk.ResultReason[e.result.reason] + '" text="' + e.result.text;
        log += '" translations="[' + config.to + ']"';
        node.debug(log);
        node.debug('result=' + JSON.stringify(e.result));
      };

      // start the recognizer and wait for a result.
      recognizer.startContinuousRecognitionAsync(
        function(result) {
          node.debug('startContinuousRecognitionAsync result');
          node.debug('result=' + JSON.stringify(result));
          // recognizer.close();
          // recognizer = undefined;
        },
        function(err) {
          node.debug('startContinuousRecognitionAsync err');
          recognizer.close();
          recognizer = undefined;
      });
    });
  }

  RED.nodes.registerType('Translate Speech', translator, {
    credentials: {key: {type: 'password'}},
  });
};
