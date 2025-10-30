function isAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next(); // user is authenticated
  } else {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

module.exports = { isAuth };
