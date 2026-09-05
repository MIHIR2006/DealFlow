package http

import (
	"net/http"

	"github.com/gin-gonic/gin"

	sqlcgen "dealflow360/backend/internal/db/sqlc"
	"dealflow360/backend/internal/platform/apierr"
	"dealflow360/backend/internal/platform/auth"
	"dealflow360/backend/internal/service"
	"dealflow360/backend/internal/transport/http/dto"
	"dealflow360/backend/internal/transport/http/middleware"
)

type authHandler struct {
	svc *service.AuthService
}

func (h authHandler) signup(c *gin.Context) {
	var req dto.SignupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, bindError(err))
		return
	}

	session, err := h.svc.Signup(c.Request.Context(), service.SignupInput{
		Email:     req.Email,
		Password:  req.Password,
		FullName:  req.FullName,
		Role:      auth.Role(req.Role),
		SalesTeam: req.SalesTeam,
	})
	if err != nil {
		Fail(c, err)
		return
	}

	OK(c, http.StatusCreated, toSession(session))
}

func (h authHandler) login(c *gin.Context) {
	var req dto.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, bindError(err))
		return
	}

	session, err := h.svc.Login(c.Request.Context(), req.Email, req.Password)
	if err != nil {
		Fail(c, err)
		return
	}

	OK(c, http.StatusOK, toSession(session))
}

func (h authHandler) me(c *gin.Context) {
	principal, ok := middleware.PrincipalOf(c)
	if !ok {
		Fail(c, apierr.Unauthenticated(""))
		return
	}

	user, err := h.svc.Me(c.Request.Context(), principal.UserID)
	if err != nil {
		Fail(c, err)
		return
	}

	OK(c, http.StatusOK, toUser(user))
}

func toSession(s service.Session) dto.SessionResponse {
	return dto.SessionResponse{
		Token:     s.Token,
		ExpiresAt: s.ExpiresAt,
		User:      toUser(s.User),
	}
}

func toUser(u sqlcgen.User) dto.User {
	return dto.User{
		ID:        u.ID,
		Email:     u.Email,
		FullName:  u.FullName,
		Role:      u.Role,
		SalesTeam: u.SalesTeam,
		IsActive:  u.IsActive,
	}
}
