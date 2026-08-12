
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {

try {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'No token provided' });
    }
    const token = authHeader.slice(7);

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.userId);

    if (!user) {
        return res.status(401).json({ message: 'User not found' });
    }

    req.user = user;
    next();
} catch (error) {
    res.status(401).json({ message: 'Invalid token' });
}
} 


module.exports = auth;