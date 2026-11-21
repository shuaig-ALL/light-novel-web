from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

ReadingMode = Literal["scroll", "slide", "flip"]


class UserRegisterRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)


class UserLoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=1, max_length=128)


class UserPreferencesUpdate(BaseModel):
    enable_gallery: bool | None = None
    hide_unread_illustrations: bool | None = None
    reading_mode: ReadingMode | None = None


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: EmailStr
    enable_gallery: bool = False
    hide_unread_illustrations: bool = True
    reading_mode: ReadingMode = "scroll"
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
