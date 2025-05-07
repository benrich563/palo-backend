import request from 'supertest';
import app from '../server.js';
import { expect } from 'chai';

describe('Upload Routes', () => {
  let authToken;
  
  before(async () => {
    // Login and get token
    const response = await request(app)
      .post('/api/users/login')
      .send({
        email: 'test@example.com',
        password: 'password123'
      });
    authToken = response.body.token;
  });

  describe('POST /api/upload/image', () => {
    it('should upload an image successfully', async () => {
      const response = await request(app)
        .post('/api/upload/image')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('image', 'tests/fixtures/test-image.jpg');
      
      expect(response.status).to.equal(200);
      expect(response.body).to.have.property('url');
      expect(response.body).to.have.property('public_id');
    });

    it('should reject non-image files', async () => {
      const response = await request(app)
        .post('/api/upload/image')
        .set('Authorization', `Bearer ${authToken}`)
        .attach('image', 'tests/fixtures/test.txt');
      
      expect(response.status).to.equal(400);
    });
  });
});