"""Standard-library tests; run with: python -m unittest test_system.py"""
import tempfile
import unittest
from pathlib import Path

from exceptions import AuthenticationError, DuplicateUserError, InvalidEmailError, WeakPasswordError
from services import UserManager
from users import Administrator, SecurityAnalyst, User


class SystemTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.manager = UserManager(root / "users.json", root / "activity.log")

    def tearDown(self): self.temp.cleanup()

    def test_validation_and_encapsulation(self):
        with self.assertRaises(InvalidEmailError): User("user1", "Ana", "bad-email", "SecurePass1!")
        with self.assertRaises(WeakPasswordError): User("user1", "Ana", "ana@example.com", "weak")
        user = User("user1", "Ana", "ana@example.com", "SecurePass1!")
        self.assertNotIn("password", user.to_dict())
        self.assertTrue(user.check_password("SecurePass1!"))

    def test_polymorphism(self):
        users = [Administrator("admin1", "Ada", "ada@example.com", "SecurePass1!"),
                 SecurityAnalyst("analyst1", "Sam", "sam@example.com", "SecurePass1!")]
        self.assertIn("manage users", users[0].display_privileges())
        self.assertIn("security logs", users[1].display_privileges())

    def test_login_lock_and_persistence(self):
        self.manager.create_user("user1", "Ana", "ana@example.com", "SecurePass1!", "User")
        for _ in range(3):
            with self.assertRaises(AuthenticationError): self.manager.authenticate("user1", "incorrect")
        self.assertTrue(self.manager.get_user("user1").is_locked)
        self.manager.unlock_user("user1")
        self.assertEqual(self.manager.authenticate("user1", "SecurePass1!").name, "Ana")
        self.assertNotIn("SecurePass1!", self.manager.storage.file_path.read_text())

    def test_generated_key_and_similar_name_rejection(self):
        user = self.manager.create_user(None, "John Smith", "john@example.com", "SecurePass1!", "User")
        self.assertTrue(user.user_id.startswith("USR_"))
        with self.assertRaises(DuplicateUserError):
            self.manager.create_user(None, "Jhon Smith", "john2@example.com", "SecurePass1!", "User")

if __name__ == "__main__": unittest.main(verbosity=2)
