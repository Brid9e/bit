import { useMutation } from '@teambit/ui';
import { gql } from '@apollo/client';
import { DocumentNode } from 'graphql';

export const LOGOUT_MUTATION: DocumentNode = gql`
  mutation LogoutUser {
    logout
  }
`;

export function useLogout(): {
  loading?: boolean;
  loggedOut?: boolean;
  logout?: () => Promise<any>;
} {
  const [logout, { data, loading }] = useMutation(LOGOUT_MUTATION);

  return {
    logout,
    loading,
    loggedOut: !!data?.logout,
  };
}
