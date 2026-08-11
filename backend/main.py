"""Interactive command-line demonstration for the Secure User Management System."""
from pathlib import Path

from exceptions import UserManagementError
from services import UserManager

BASE_DIR = Path(__file__).resolve().parent
manager = UserManager(BASE_DIR / "data" / "users.json", BASE_DIR / "data" / "activity.log")


def create_user() -> None:
    try:
        user = manager.create_user(input("User ID (leave blank to generate): ").strip(), input("Name: ").strip(),
                                   input("Email: ").strip(), input("Password: "),
                                   input("Role (Administrator/Security Analyst/User): ").strip())
    except (UserManagementError, ValueError) as error:
        print(f"Validation error: {error}")
    else:
        print(f"Created {user}.")
    finally:
        print("Create-user request completed.")


def main() -> None:
    while True:
        print("\n1 Create  2 List  3 Privileges  4 Login  5 Report  6 Exit")
        choice = input("Choice: ").strip()
        try:
            if choice == "1": create_user()
            elif choice == "2": print(*manager.users, sep="\n")
            elif choice == "3": print(*(user.display_privileges() for user in manager.users), sep="\n")
            elif choice == "4": print(f"Welcome, {manager.authenticate(input('User ID: '), input('Password: ')).name}.")
            elif choice == "5": print(manager.activity_report())
            elif choice == "6": manager.save(); print("Data saved. Goodbye."); break
            else: print("Choose a number from 1 to 6.")
        except UserManagementError as error:
            print(f"Request failed: {error}")
        finally:
            manager.logger.flush()


if __name__ == "__main__":
    main()
