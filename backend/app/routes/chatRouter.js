const express = require("express");
const expressWs = require('express-ws');
const router = express.Router();
const mysql = require("../models/dbConnection");
const uuid = require("uuid");
const { json } = require("sequelize");
const WebSocket = require('ws');
const https = require("https");
const axios = require("axios");
const openaiAgent = new https.Agent({
  rejectUnauthorized: false,
});
router.use((req, res, next) => {
  const origin = req.headers.origin;

  // Allow your React dev server
  if (origin === "http://localhost:3000") {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With"
    );
  }

  // Preflight
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});
expressWs(router);

let num = 0;
const connections = new Set();
router.ws('/sendMessage',(ws,req)=>{
    connections.add(ws);
    ws.on('message',async(message)=>{
        let sql3 = null;
        let conversationId = null;
        let name = null;
        // connections.add(ws);
        const parsedMessage = JSON.parse(message);
        //identity refers to sender identity
        const chatMessage = {
            message: parsedMessage.message,
            timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
            sender: parsedMessage.sender,
            receiver: parsedMessage.receiver,
            senderIdentity: parsedMessage.senderIdentity,
            receiverIdentity: parsedMessage.receiverIdentity,
          };
          let sql1 = `SELECT conversation_id FROM chat_table WHERE sender = ${chatMessage.receiver} and sender_identity = '${chatMessage.receiverIdentity}' LIMIT 1 `;
          let sql2 = `SELECT conversation_id FROM chat_table WHERE sender = ${chatMessage.sender} and sender_identity = '${chatMessage.senderIdentity}' LIMIT 1 `;
          try {
            let result1 = await mysql.query(sql1);
            let result2 = await mysql.query(sql2);
            if(result1.length==0&&result2.length==0){
                conversationId = uuid.v4();
                let sql = `INSERT into chat_table (conversation_id, sender, receiver, sender_identity, receiver_identity, time, message) VALUES ('${conversationId}', ${chatMessage.sender}, ${chatMessage.receiver},'${chatMessage.senderIdentity}', '${chatMessage.receiverIdentity}', '${chatMessage.timestamp}', '${chatMessage.message}');`;
                mysql.query(sql);
            }else{
              let res = result1.length==0? result2:result1;
              conversationId = res[0].conversation_id;
              let sql = `INSERT into chat_table (conversation_id, sender, receiver, sender_identity, receiver_identity, time, message) VALUES ('${conversationId}', ${chatMessage.sender}, ${chatMessage.receiver},'${chatMessage.senderIdentity}', '${chatMessage.receiverIdentity}', '${chatMessage.timestamp}', '${chatMessage.message}');`;
              await mysql.query(sql);
            }
          } catch (error) {
            console.log(error,"Something wrong in MySQL." );
            connections.forEach((client) => {
              if (client.readyState === 1) {
                client.send("Server is busy");
              }
            });
            return;
          }
          connections.forEach((client) => {
            if (client.readyState === 1) {
              let chatInfo = {
                chatMessage:chatMessage,
                conversationId:conversationId,
              }
              client.send(JSON.stringify(chatInfo));
            }
            
          });
          
    });
});



router.get("/getConversationIdByUserIdentity",async(req,res)=>{
  const sender = req.query.sender;
  const senderIdentity = req.query.senderIdentity;
  const receiver = req.query.receiver;
  const receiverIdentity = req.query.receiverIdentity;
  let result = null;
  // console.log(sender);
  let sql = `SELECT conversation_id FROM chat_table WHERE sender = ${sender} and sender_identity = '${senderIdentity}' and receiver =${receiver} and receiver_identity='${receiverIdentity}' LIMIT 1 `;
  let sql2 = `SELECT conversation_id FROM chat_table WHERE sender = ${receiver} and sender_identity = '${receiverIdentity}' and receiver =${sender} and receiver_identity='${senderIdentity}' LIMIT 1 `;
  // console.log(sql);
  try{
    let result1 = await mysql.query(sql);
    let result2 = await mysql.query(sql2);
    if(result1.length!==0||result2.length!==0){
      result = result1.length==0? result2:result1;
    }
    // console.log(result);
    if(result.length!=0){
      res.json(result[0]);
    }else{
      res.send('no such conversation');
    }
  }catch(error){
    console.log(error,"Something wrong in MySQL.");
    res.send("server is busy");
    return;
  }

});

router.get("/getChatHistoryByConversationId",async(req,res)=>{
  const conversationId = req.query.conversationId;
  // console.log(conversationId);
  let sql = `SELECT * FROM chat_table WHERE conversation_id = '${conversationId}'`;
  try{
    let result = await mysql.query(sql);
    if(result.length!=0){
      res.json(result);
    }else{
      res.send('no such conversation');
    }
  }catch(error){
    console.log(error,"Something wrong in MySQL.");
    res.send("server is busy");
    return;
  }

});

router.get("/getCurrentId",async(req,res)=>{
  // console.log(num);
  let identity = null;
  if (num % 2 === 0) {
    identity  = 'doctor';
} else {
    identity = 'patient';
}
  num = num+1;
  let info = null;
  try{
    if(identity == 'doctor'){
      let sql = `SELECT * FROM doctors_registration  WHERE id=58`
      info = await mysql.query(sql);
    }else{
      let sql = `SELECT * FROM patients_registration  WHERE id=132`
      info = await mysql.query(sql);
    }
  }catch(error){
    console.log(error,"Something wrong in MySQL.");
    res.send("server is busy");
    return;
  }

  res.json({
    identity:identity,
    info:info[0]
  });
});

router.get('/getInfo',async(req,res)=>{
  console.log(req.session.identity);
  console.log(req.session.email);
  let email = req.session.email;
  let identity = req.session.identity;
  try{
    if(identity == 'Doctor'){
      let sql = `SELECT * FROM doctors_registration  WHERE EmailId= '${email}'`;
      info = await mysql.query(sql);
    }else{
      let sql = `SELECT * FROM patients_registration  WHERE EmailId= '${email}'`;
      info = await mysql.query(sql);
    }
  }catch(error){
    console.log(error,"Something wrong in MySQL.");
    res.send("server is busy");
    return;
  }
  res.json({
    identity:identity,
    id:info[0].id
  });

});


router.get('/getDoctorIDByPatientID', async(req,res)=>{
  const patientId = req.query.patientId;
  try{
    let sql = `SELECT doctor_id FROM doctor_recordauthorized  WHERE patient_id = ${patientId}`;
    let result = await mysql.query(sql);
    console.log(result);
    res.json({doctorId:result[0].doctor_id});
  }catch(error){
    console.log(error,"Something wrong in MySQL.");
    res.send("server is busy");
    return;
  }
});

// ==============================
// OpenAI Realtime: mint client secret (ephemeral key)
// ==============================

function postJson(url, headers, bodyObj) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const body = JSON.stringify(bodyObj);

      const req = https.request(
        {
          hostname: u.hostname,
          path: u.pathname + u.search,
          method: "POST",
          agent: openaiAgent,
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
            ...headers,
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data || "{}");
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve(parsed);
              } else {
                reject({
                  statusCode: res.statusCode,
                  error: parsed,
                });
              }
            } catch (e) {
              reject({ statusCode: res.statusCode, error: data });
            }
          });
        }
      );

      req.on("error", reject);
      req.write(body);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * GET /realtime/client-secret?mode=doctor|patient
 *
 * Returns: JSON from OpenAI that includes `client_secret.value`
 * Frontend uses that ephemeral secret to connect to Realtime.
 */
router.get("/realtime/client-secret", async (req, res) => {
  try {
    const apiKey = (process.env.OPENAI_API_KEY || "").trim();
    if (!apiKey) {
      return res.status(500).json({
        error: "Missing OPENAI_API_KEY in environment variables",
      });
    }

    const mode = (req.query.mode || "patient").toLowerCase();
    const isDoctor = mode === "doctor";
    const fs = require("fs");
    const path = require("path");
    const PATIENT_INSTRUCTIONS = fs.readFileSync(
      path.join(__dirname, "../../prompts/patient_instructions.txt"),
      "utf8"
    );
    const DOCTOR_INSTRUCTIONS = fs.readFileSync(
      path.join(__dirname, "../../prompts/doctor_instructions.txt"),
      "utf8"
    );

    // Add validation in /realtime/client-secret
    const instructions = isDoctor ? DOCTOR_INSTRUCTIONS : PATIENT_INSTRUCTIONS;
    if (!instructions || instructions.trim().length === 0) {
      throw new Error('Prompt file empty or missing');
    }

    const sessionConfig = {
      session: {
        type: "realtime",
        model: "gpt-realtime",
        instructions,
        audio: {
          input: {
            turn_detection: { type: "server_vad" },
            transcription: { model: "gpt-4o-mini-transcribe" },
          },
          output: { voice: "verse" },
        },
      },
    };

    const data = await postJson(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        Authorization: `Bearer ${apiKey}`,
      },
      sessionConfig
    );

    // Return the full payload (includes client_secret + expires_at)
    return res.json(data);
  } catch (err) {
    console.error("Realtime client secret error:", err);
    return res.status(500).json({
      error: "Failed to create realtime client secret",
      details: err?.error || err,
    });
  }
});

router.post(
  "/realtime/sdp",
  express.text({ type: "application/sdp" }),
  async (req, res) => {
    try {
      const apiKey = (process.env.OPENAI_API_KEY || "").trim();
      if (!apiKey) {
        return res.status(500).send("Missing OPENAI_API_KEY");
      }

      const model = (req.query.model || "gpt-realtime").toString();
      const mode = (req.query.mode || "patient").toString().toLowerCase();
      const offerSdp = req.body;

      if (!offerSdp || typeof offerSdp !== "string") {
        return res.status(400).send("Missing offer SDP body");
      }

      const fs = require("fs");
      const path = require("path");
      const instructions = fs
        .readFileSync(path.join(__dirname, `../../prompts/${mode}_instructions.txt`), "utf8")
        .trim();

      const sessionConfig = {
        type: "realtime",
        model,
        instructions,
        audio: {
          input: {
            turn_detection: { type: "server_vad" },
            transcription: { model: "gpt-4o-mini-transcribe" },
          },
          output: { voice: "verse" },
        },
      };

      const formData = new FormData();
      formData.set("sdp", offerSdp);
      formData.set("session", JSON.stringify(sessionConfig));

      const openAiRes = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/sdp",
        },
        body: formData,
      });

      const answerSdp = await openAiRes.text();
      if (!openAiRes.ok) {
        throw new Error(`OpenAI SDP exchange failed (${openAiRes.status}): ${answerSdp}`);
      }

      res.setHeader("Content-Type", "application/sdp");
      return res.status(200).send(answerSdp);
    } catch (err) {
      console.error("Realtime SDP relay error:", err);
      return res.status(500).send(err?.message || "SDP relay failed");
    }
  }
);

router.get("/get-instructions", (req, res) => {
  const mode = (req.query.mode || "patient").toLowerCase();
  const fs = require("fs");
  const path = require("path");
  
  try {
    const instructions = fs.readFileSync(
      path.join(__dirname, `../../prompts/${mode}_instructions.txt`),
      "utf8"
    ).trim();
    
    res.json({ instructions });
  } catch (err) {
    res.status(404).json({ error: "Instructions file not found" });
  }
});

/**
 * Proxy Hugging Face Inference (browser cannot call HF directly — CORS).
 * Set HF_SENTIMENT_TOKEN or HUGGINGFACE_API_TOKEN on the server.
 */
router.post("/sentiment/inference", async (req, res) => {
  const token = (
    process.env.HF_SENTIMENT_TOKEN ||
    process.env.HUGGINGFACE_API_TOKEN ||
    ""
  ).trim();
  if (!token) {
    return res.status(503).json({
      error: "HF sentiment token not configured (HF_SENTIMENT_TOKEN)",
    });
  }
  try {
    const hfRes = await axios.post(
      "https://api-inference.huggingface.co/models/cardiffnlp/twitter-roberta-base-sentiment-latest",
      req.body,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        validateStatus: () => true,
      }
    );
    return res.status(hfRes.status).json(hfRes.data);
  } catch (err) {
    console.error("HF sentiment proxy error:", err.message);
    return res.status(500).json({ error: "Sentiment inference failed" });
  }
});

/**
 * POST /clinical-interview/summary
 * Body: { transcript: string }
 * Returns: { summary: string } — AI summary for EMR / visit observations.
 */
router.post("/clinical-interview/summary", async (req, res) => {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return res.status(500).json({
      error: "Missing OPENAI_API_KEY in environment variables",
    });
  }
  const transcript = (req.body?.transcript || "").trim();
  if (!transcript) {
    return res.status(400).json({ error: "transcript is required" });
  }
  try {
    const hfRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a clinical documentation assistant. Given a transcript of a doctor–assistant clinical reasoning voice session, write a concise, professional summary suitable for a patient chart. Use short sections: Chief concerns / History, Key points discussed, Assessment (if inferable), and Plan or follow-up (if inferable). Use neutral clinical language. If the transcript is empty or nonsensical, say so briefly.",
          },
          {
            role: "user",
            content: transcript.slice(0, 120000),
          },
        ],
        max_tokens: 1500,
        temperature: 0.25,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        httpsAgent: openaiAgent,
        timeout: 120000,
        validateStatus: () => true,
      }
    );
    if (hfRes.status < 200 || hfRes.status >= 300) {
      const errText =
        typeof hfRes.data === "string"
          ? hfRes.data
          : JSON.stringify(hfRes.data || {});
      console.error("OpenAI summary error:", hfRes.status, errText);
      return res.status(502).json({
        error: "Failed to generate summary",
        details: errText,
      });
    }
    const summary = hfRes.data?.choices?.[0]?.message?.content?.trim();
    if (!summary) {
      return res.status(500).json({ error: "No summary in model response" });
    }
    return res.json({ summary });
  } catch (err) {
    console.error("clinical-interview/summary:", err.message);
    return res.status(500).json({
      error: "Summary request failed",
      details: err.message,
    });
  }
});


module.exports = router;