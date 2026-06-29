export default defineOAuthGoogleEventHandler({
  async onSuccess(event, { user }) {
    console.log(`%cuser`, 'background-color: lime;', user)
    await setUserSession(event, { user: { ...user, id: user.email } })
    return sendRedirect(event, '/purchases')
  }
})
