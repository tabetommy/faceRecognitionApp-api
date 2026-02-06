const express=require('express');
const bodyParser=require("body-parser");
const bcrypt=require("bcrypt-nodejs");
const Clarifai=require("clarifai");

const cors= require("cors");
const corsOptions ={
    origin:'*', 
    credentials:true,           
    optionSuccessStatus:200,
 }
 const knex = require('knex')
 const db=knex({
    client: 'pg',
    connection: {
      host : '127.0.0.1',
      port : 5432,
      user : 'postgres',
      password : 'test',
      database : 'faceReg'
    }
  }); 
 
const app= express();
// Use the port Render gives you, or default to 3000 for local testing
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(cors(corsOptions));

app.get('/',(req,res)=>{
    res.send(database.users)
})

app.post('/signin', (req,res)=>{
    const{email,password}= req.body;
    if(!email||!password){
        return res.status(400).json('Wrong form submission')
    }
 db.select('email', 'hash').from('login')
 .where('email','=',req.body.email)
 .then(data=>{
    const isValid=bcrypt.compareSync(password, data[0].hash)
    if(isValid){
        return db.select('*').from('users')
        .where('email','=',email)
        .then(user=>{
            res.json(user[0])
        })
        .catch(err=>res.status(400).json('Unable to get user'))
    }else{
        res.status(400).json('Wrong credentials')
    }
 })
 .catch(err=>res.status(400).json('Wrong credentials'))
})

app.post('/register', (req, res)=>{
    const{email,name,password}= req.body;
    if(!name||!email||!password){
        return res.status(400).json('Wrong form submission')
    }
    const hash=bcrypt.hashSync(password)
    db.transaction(trx=>{
        trx.insert({
            hash:hash,
            email:email
        })
        .into('login')
        .returning('email')
        .then(loginEmail=>{
            trx('users')
            .returning('*')
            .insert({
                email:loginEmail[0],
                name:name,
                joined:new Date()
            })
            .then(user=>{
                res.json(user[0])
        })
    })
    .then(trx.commit)
    .catch(trx.rollback)
    }) 
    .catch(err=>res.status(400).json('Unable to regiter')) 
})

app.get('/profile/:id',(req,res)=>{
    const{id}=req.params;
    db.select('*').from('users')
    .where({id:id})
    .then(user=>{
        if(user.length){
            res.json(user[0])
        } else{
            res.status(400).json('Error getting data')
        }    
    })
   
})

app.put('/image', (req,res)=>{
    const{id}=req.body;
    db('users').where('id','=',id)
    .increment('entries',1)
    .returning('entries')
    .then(entries=>{
        res.json(entries[0])
    })
    .catch(err=>res.status(400).json('unable to get entries'))
})

// app.post('/imageurl', (req,res)=>{
//     clarifaiKey.models
//     .predict(Clarifai.FACE_DETECT_MODEL,req.body.input)
//     .then(data=>{
//         res.json(data)
//     })
//     .catch(err=>res.status(400).json('Unable to fetch API'))
// })

app.post('/imageurl', (req, res) => {
  const { input } = req.body;
  
  const raw = JSON.stringify({
    "user_app_id": {
      "user_id": "clarifai", 
      "app_id": "main"  
    },
    "inputs": [
      {
        "data": {
          "image": {
            "url": input
          }
        }
      }
    ]
  });

  const requestOptions = {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Authorization': 'Key ' + 'f9ea72f41cf34b1a8187d080242f5990'
    },
    body: raw
  };

  // FIXED URL: Points to the 'clarifai' user and 'main' app where the model lives
  fetch("https://api.clarifai.com/v2/models/face-detection/outputs", requestOptions)
    .then(response => response.json())
    .then(data => {
      res.json(data);
    })
    .catch(err => res.status(400).json('unable to work with API'));
});

app.listen(PORT,'0.0.0.0',()=>{
    console.log(`app is running on port ${PORT}`)
})

