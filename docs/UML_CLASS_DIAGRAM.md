# UML Class Diagram

```mermaid
classDiagram
    class User {
        -str _user_id
        -str _name
        -str _email
        -str _role
        -str __password_hash
        -str __salt
        -int _failed_login_attempts
        -bool _is_locked
        +check_password(password) bool
        +register_login_attempt(password) bool
        +change_password(old, new)
        +display_privileges() str
        +to_dict() dict
    }
    class Administrator {
        +display_privileges() str
    }
    class SecurityAnalyst {
        +display_privileges() str
    }
    class UserManager {
        -dict _users
        +create_user(...) User
        +authenticate(user_id, password) User
        +unlock_user(user_id) User
        +activity_report() dict
    }
    class Validator {
        +validate_email(email)
        +validate_password(password)
        +hash_password(password) tuple
        +verify_password(...) bool
    }
    class JsonUserStorage {
        +load() list~dict~
        +save(users)
    }
    class ActivityLogger {
        +log(action, user_id, details)
        +flush()
    }
    User <|-- Administrator
    User <|-- SecurityAnalyst
    UserManager --> User
    UserManager --> JsonUserStorage
    UserManager --> ActivityLogger
    User --> Validator
```

`Administrator` and `SecurityAnalyst` are specializations of `User`. Calling `display_privileges()` on a mixed list invokes each object’s overridden implementation at runtime, demonstrating polymorphism.
