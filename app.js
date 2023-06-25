const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (authHeader === undefined) {
    response.status(400);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY-SECRET-TOKEN", (error, payload) => {
      if (error) {
        response.status(400);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

const follows = async (request, response, next) => {
  const { tweetId } = request.params;
  let isFollowing = await db.get(`
    select * from  follower where follower_user_id = (select user_id from user where username = '${request.username}')
    and 
    following_user_id = (select user.user_id from tweet natural join user where tweet_id = ${tweetId})
    `);
  if (isFollowing === undefined) {
    response.status(400);
    response.send("Invalid Request");
  } else {
    next();
  }
};

// REGISTER API

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(request.body.password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = "${username}"`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    if (password.length >= 6) {
      const registorUser = `
      INSERT INTO 
      user( username, password, name, gender)
      values
      (
          '${username}',
          '${hashedPassword}',
          '${name}',
          '${gender}'
                 )`;
      const dbResponse = await db.run(registorUser);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

// API 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserDetails = `SELECT * FROM user WHERE  username = '${username}'`;

  const dbUser = await db.get(getUserDetails);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    const payload = { username: username };
    if (isPasswordMatched === true) {
      const jwtToken = jwt.sign(payload, "MY-SECRET-TOKEN");
      response.send(jwtToken);
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// API 3

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;

  const getUserId = `
  SELECT user_id
  FROM 
  user
  where username = '${username}'
  `;
  const dbUser = await db.get(getUserId);

  const getTweets = `
  SELECT 
  user.username , tweet.tweet,tweet.date_time as dateTime 
  from 
  follower left join tweet on tweet.user_id= follower.following_user_id
  left join user on follower.following_user_id = user.user_id
  where follower.follower_user_id = ${dbUser.user_id}
  order by tweet.date_time desc
  limit 4
  `;
  const tweetDetails = await db.all(getTweets);
  response.send(tweetDetails);
});
//API 4

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;

  const getUserId = `
  SELECT user_id
  FROM 
  user
  where username = '${username}'
  `;
  const dbUser = await db.get(getUserId);

  const getFollower = `
  SELECT 
  user.name 
  from 
  follower left join user on follower.following_user_id = user.user_id
  where follower.follower_user_id = ${dbUser.user_id}`;
  const followerDetails = await db.all(getFollower);
  response.send(followerDetails);
});

// API 5

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserId = `
  SELECT user_id
  FROM 
  user
  where username = '${username}'
  `;
  const dbUser = await db.get(getUserId);

  const getFollower = `
  select user.name
  from 
  user left join follower on follower.follower_id = user.user_id
  where follower.following_user_id = ${dbUser.user_id}`;

  const followerDetails = await db.all(getFollower);
  response.send(followerDetails);
});

// API 6

app.get(
  "/tweets/:tweetId/",
  authenticateToken,
  follows,
  async (request, response) => {
    const { tweetId } = request.params;

    const { tweet, date_time } = await db.get(`
select 
tweet , date_time 
from 
tweet 
where 
tweet_id = ${tweetId}
`);
    const { likes } = await db.get(`
select 
count(like_id) as likes 
from 
like
where 
tweet_id = ${tweetId}
`);

    const { replies } = await db.get(`
select 
count(reply_id) as replies 
from 
reply 
where 
tweet_id = ${tweetId}
`);
    response.send({ tweet, likes, replies, dateTime: date_time });
  }
);

// API 7

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  follows,
  async (request, response) => {
    const { tweetId } = request.params;
    const likedBy = await db.all(`
    select user.username from like natural join user where tweet_id = ${tweetId}
    `);
    response.send({ likes: likedBy.map((item) => item.username) });
  }
);

// API 8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  follows,
  async (request, response) => {
    const { tweetId } = request.params;
    const getReplies = `
    select 
    user.name ,reply.reply 
    from 
    user natural join reply 
    where 
    tweet_id = ${tweetId}
    `;
    const dbUser = await db.all(getReplies);
    response.send(dbUser);
  }
);

//API 9

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;

  const getAllTweets = `
    select tweet.tweet,count(distinct like.like_id) as likes , count(distinct reply.reply_id) as replies , tweet.date_time as dateTime
    from 
    tweet left join like on tweet.tweet_id = like.tweet_id left join reply on tweet.tweet_id = reply.tweet_id
    where 
   tweet.user_id = (select user_id from user where username = '${username}')
    `;
  const dbUser = await db.all(getAllTweets);
  response.send(dbUser);
});

// API 10
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const { username } = request;

  const { user_id } = await db.get(
    `select user_id from user where username = '${username}'`
  );

  await db.run(
    `insert into tweet 
      (tweet,user_id)
      values
      ("${tweet}",${user_id})
      `
  );
  response.send("Created a Tweet");
});

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const userTweet = await db.get(`
    select 
    tweet_id,user_id from tweet 
    where tweet_id = ${tweetId} and user_id = (select user_id from user where username = '${request.username}')
    `);
    if (userTweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      await db.run(
        ` delete from tweet 
            where tweet_id = ${tweetId}
            `
      );
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
