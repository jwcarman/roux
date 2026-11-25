package users

// The activities a user's history is made of. Their type codes are stored with the
// rows, so they never change once rows exist.

// UserInvited: someone was invited, by the name they were invited with.
type UserInvited struct {
	Name string `json:"name"`
}

func (UserInvited) Type() string       { return "user.invited" }
func (a UserInvited) Describe() string { return "Invited " + a.Name }

// UserRenamed: a user's display name changed.
type UserRenamed struct {
	From string `json:"from"`
	To   string `json:"to"`
}

func (UserRenamed) Type() string       { return "user.renamed" }
func (a UserRenamed) Describe() string { return "Renamed from " + a.From + " to " + a.To }

// UserRoleChanged: a user's role changed.
type UserRoleChanged struct {
	From string `json:"from"`
	To   string `json:"to"`
}

func (UserRoleChanged) Type() string       { return "user.role_changed" }
func (a UserRoleChanged) Describe() string { return "Role changed from " + a.From + " to " + a.To }

// UserDeactivated: who no longer lets them sign in.
type UserDeactivated struct{}

func (UserDeactivated) Type() string     { return "user.deactivated" }
func (UserDeactivated) Describe() string { return "Deactivated" }

// UserReactivated: they may sign in again.
type UserReactivated struct{}

func (UserReactivated) Type() string     { return "user.reactivated" }
func (UserReactivated) Describe() string { return "Reactivated" }

// UserSignedUp: someone made themselves a user with a provider account.
type UserSignedUp struct {
	Name string `json:"name"`
}

func (UserSignedUp) Type() string       { return "user.signed_up" }
func (a UserSignedUp) Describe() string { return a.Name + " signed up" }
