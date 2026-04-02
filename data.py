# import bcrypt
# password = b"Admin@12345"
# hashed = bcrypt.hashpw(password, bcrypt.gensalt())
# print(hashed.decode())

import secrets

def generate_api_key(length=32):
    return secrets.token_hex(length)

api_key = generate_api_key()
print(api_key)