from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator

Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]
FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class AuthInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class EmailInput(AuthInput):
    email: EmailStr = Field(max_length=254)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.lower()


class RegisterInput(EmailInput):
    full_name: FullName
    password: Password


class LoginInput(EmailInput):
    password: str = Field(min_length=1, max_length=128)


class TokenInput(AuthInput):
    token: str = Field(min_length=32, max_length=256)


class ResetPasswordInput(TokenInput):
    password: Password


class ChangePasswordInput(AuthInput):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: Password


class ProfileInput(AuthInput):
    full_name: FullName


class UserOutput(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    full_name: str
    role: Literal["student", "teacher", "admin"]
    status: Literal["active", "locked"]
    email_verified_at: datetime | None
    created_at: datetime


class MessageOutput(BaseModel):
    message: str
