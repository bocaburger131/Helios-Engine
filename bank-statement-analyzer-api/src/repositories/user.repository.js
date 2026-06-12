import UserModel from '../models/user/User.js';

class UserRepository {
  /**
   * Create a new user
   * @param {Object} userData - User data to create
   * @returns {Promise<Object>} Created user
   */
  async createUser(userData) {
    return await UserModel.create(userData);
  }

  /**
   * Find a user by email
   * @param {string} email - Email to search for
   * @returns {Promise<Object|null>} Found user or null
   */
  async findUserByEmail(email) {
    return await UserModel.findOne({ email });
  }

  /**
   * Find a user by ID
   * @param {string} id - User ID
   * @returns {Promise<Object|null>} Found user or null
   */
  async findUserById(id) {
    return await UserModel.findById(id);
  }

  /**
   * Update a user by ID
   * @param {string} id - User ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object|null>} Updated user or null
   */
  async updateUser(id, updateData) {
    return await UserModel.findByIdAndUpdate(id, updateData, { new: true });
  }

  /**
   * Delete a user by ID
   * @param {string} id - User ID
   * @returns {Promise<Object|null>} Deleted user or null
   */
  async deleteUser(id) {
    return await UserModel.findByIdAndDelete(id);
  }
}

export default new UserRepository();
